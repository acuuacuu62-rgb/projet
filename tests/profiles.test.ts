import { test } from "node:test";
import assert from "node:assert/strict";
import { validateJobConfig } from "../backend/app";
import { detectedProfile } from "../lib/installation-profiles";
import { createApp } from "../backend/app";
import { Store } from "../backend/store";
import { Vault } from "../backend/security";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Panel and Wings accept explicit profiles and preserve the legacy 24.04 default", () => {
  const panel = {
    domain: "panel.example.com",
    email: "admin@example.com",
    admin_name: "admin",
    admin_password: "synthetic-password",
    ssl: true,
    consent: true,
  };
  const wings = {
    domain: "node.example.com",
    email: "admin@example.com",
    panel_url: "https://panel.example.com/",
    node_id: 1,
    yaml: "synthetic YAML validated separately by the worker",
    consent: true,
  };
  for (const type of [
    "install_panel",
    "install_wings",
    "configure_wings",
    "upcloud_setup",
  ]) {
    const config = type === "install_panel" ? panel : wings;
    const legacy = validateJobConfig(type, config);
    assert("os_profile" in legacy);
    assert.equal(legacy.os_profile, "ubuntu-24.04");
    for (const os_profile of ["ubuntu-22.04", "ubuntu-24.04"]) {
      const parsed = validateJobConfig(type, { ...config, os_profile });
      assert("os_profile" in parsed);
      assert.equal(parsed.os_profile, os_profile);
    }
    for (const os_profile of ["ubuntu-20.04", "debian-12", "ubuntu-22.04;id"])
      assert.throws(() => validateJobConfig(type, { ...config, os_profile }));
  }
  assert.equal(
    detectedProfile({ os_id: "ubuntu", os_version: "22.04" }),
    "ubuntu-22.04",
  );
  assert.equal(
    detectedProfile({ os_id: "ubuntu", os_version: "24.04" }),
    "ubuntu-24.04",
  );
  assert.equal(
    detectedProfile({ os_id: "debian", os_version: "22.04" }),
    undefined,
  );
  assert.equal(detectedProfile(), undefined);
});

test("API rejects profile mismatch and queues only matching owner-scoped encrypted configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-profiles-"));
  const store = await new Store(join(dir, "data")).init();
  const vault = await new Vault().init(join(dir, "keys"));
  const { app, internal } = await createApp(store, vault, {
    origins: ["http://localhost:3000"],
    workerToken: "synthetic-token",
  });
  const previous = process.env.ENABLE_INSTALLERS;
  process.env.ENABLE_INSTALLERS = "true"; // Queue only; no worker or SSH is started.
  try {
    const registered = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { origin: "http://localhost:3000" },
      payload: {
        name: "Profile Test",
        email: "profile@example.test",
        password: "synthetic-password",
      },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const user = registered.json().user;
    const headers = {
      origin: "http://localhost:3000",
      cookie: registered.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": registered.json().csrf,
    };
    await store.transaction((d) => {
      const connection = {
        host: "8.8.8.8",
        ip: "8.8.8.8",
        port: 22,
        auth: "password",
        credential: vault.seal(
          '{"password":"synthetic"}',
          user.id,
          "connection",
        ),
      };
      for (const version of ["22.04", "24.04"])
        d.servers.push({
          ...connection,
          id: version,
          user_id: user.id,
          created_at: new Date().toISOString(),
          name: "Fixture " + version,
          provider: "Other Provider",
          evidence: { os_id: "ubuntu", os_version: version },
        });
      d.servers.push({
        ...connection,
        id: "other-owner",
        user_id: "another-owner",
        created_at: new Date().toISOString(),
        name: "Hidden",
        evidence: { os_id: "ubuntu", os_version: "22.04" },
      });
    });
    const send = (server_id: string, os_profile: string) =>
      app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers,
        payload: {
          server_id,
          type: "install_panel",
          confirmed: true,
          idempotency_key: crypto.randomUUID(),
          config: {
            os_profile,
            domain: "panel.example.com",
            email: "admin@example.com",
            admin_name: "admin",
            admin_password: "synthetic-panel-password",
            ssl: true,
            consent: true,
          },
        },
      });
    assert.equal((await send("other-owner", "ubuntu-22.04")).statusCode, 404);
    assert.equal((await send("22.04", "ubuntu-24.04")).statusCode, 422);
    assert.equal((await send("24.04", "ubuntu-22.04")).statusCode, 422);
    assert.equal(store.snapshot().jobs.length, 0);
    for (const version of ["22.04", "24.04"]) {
      const response = await send(version, "ubuntu-" + version);
      assert.equal(response.statusCode, 202, response.body);
      assert.equal(response.json().config_secret, undefined);
      const persisted = store
        .snapshot()
        .jobs.find((j: any) => j.id === response.json().id);
      assert.equal(
        JSON.parse(vault.open(persisted.config_secret, user.id)).os_profile,
        "ubuntu-" + version,
      );
      assert(!JSON.stringify(persisted).includes("synthetic-panel-password"));
    }
  } finally {
    if (previous === undefined) delete process.env.ENABLE_INSTALLERS;
    else process.env.ENABLE_INSTALLERS = previous;
    await app.close();
    await internal.close();
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
