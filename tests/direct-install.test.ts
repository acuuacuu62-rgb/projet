import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../backend/store";
import { Vault, hash } from "../backend/security";
import { createApp } from "../backend/app";
import { serverSchema } from "../lib/contracts";

test("direct installation binds SSH proof, queues atomically and purges connection on every terminal path and backups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-direct-"));
  let store = await new Store(join(dir, "data")).init();
  const vault = await new Vault().init(join(dir, "keys"));
  const options = {
    origins: ["http://localhost:3000"],
    workerToken: "synthetic-worker-token",
  };
  let { app, internal } = await createApp(store, vault, options);
  const old = process.env.ENABLE_INSTALLERS;
  process.env.ENABLE_INSTALLERS = "true";
  const req = (
    path: string,
    method: any = "GET",
    payload?: any,
    headers: any = {},
  ) =>
    app.inject({
      url: "/v1" + path,
      method,
      payload,
      headers: { origin: options.origins[0], ...headers },
    });
  const worker = (path: string, payload = {}) =>
    internal.inject({
      url: path,
      method: "POST",
      payload,
      headers: { authorization: "Bearer " + options.workerToken },
    });
  try {
    const a = await req("/auth/register", "POST", {
      name: "Direct User",
      email: "direct@example.test",
      password: "synthetic-account-password",
    });
    const headers = {
      cookie: a.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": a.json().csrf,
    };
    const owner = a.json().user.id;
    const b = await req("/auth/register", "POST", {
      name: "Other User",
      email: "other-direct@example.test",
      password: "other-account-password",
    });
    const other = {
      cookie: b.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": b.json().csrf,
    };
    assert.equal((await req("/servers", "POST", {}, headers)).statusCode, 410);
    const server = serverSchema.parse({
      name: "Private name",
      host: "8.8.8.8",
      port: 22,
      username: "root",
      provider: "Other Provider",
      mode: "universal",
      auth: "password",
      password: "synthetic-vps-secret",
      fingerprint: "SHA256:" + "A".repeat(43),
    });
    const config = {
      domain: "panel.example.com",
      email: "admin@example.com",
      admin_name: "admin",
      admin_password: "synthetic-panel-secret",
      ssl: true,
      consent: true,
      os_profile: "ubuntu-22.04",
    };
    const prove = async () => {
      const id = crypto.randomUUID();
      await store.transaction((d) =>
        d.probes.push({
          id,
          user_id: owner,
          created_at: new Date().toISOString(),
          host: server.host,
          port: 22,
          ip: server.host,
          server_digest: hash(JSON.stringify(server)),
          evidence: { os_id: "ubuntu", os_version: "22.04" },
          expires_at: Date.now() + 600000,
        }),
      );
      return {
        connection: { server, test_id: id },
        type: "install_panel",
        config,
        confirmed: true,
        idempotency_key: crypto.randomUUID(),
      };
    };
    const payload = await prove();
    assert.equal((await req("/jobs", "POST", payload, other)).statusCode, 404);
    assert.equal(
      (
        await req(
          "/jobs",
          "POST",
          {
            ...payload,
            connection: {
              ...payload.connection,
              server: { ...server, port: 2222 },
            },
          },
          headers,
        )
      ).statusCode,
      409,
    );
    const queued = await req("/jobs", "POST", payload, headers);
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(store.snapshot().servers.length, 1);
    assert.equal(
      (await req("/workspace", "GET", undefined, headers)).json().servers
        .length,
      0,
    );
    assert.equal(
      (await req("/servers", "GET", undefined, headers)).json().length,
      0,
    );
    assert.equal(
      (await req("/jobs", "POST", payload, headers)).json().id,
      queued.json().id,
    );
    assert.equal(
      (await req("/jobs", "POST", await prove(), headers)).statusCode,
      409,
    );
    assert(!JSON.stringify(store.snapshot()).includes(server.password!));
    assert(!JSON.stringify(store.snapshot()).includes(config.admin_password));
    // Pending sessions survive an API restart; no browser or worker process is required.
    await app.close();
    await internal.close();
    await store.close();
    store = await new Store(join(dir, "data")).init();
    ({ app, internal } = await createApp(store, vault, options));
    const claimed = (await worker("/claim")).json();
    assert.equal(claimed.credential.password, server.password);
    assert.equal(claimed.server.fingerprint, server.fingerprint);
    assert.equal(claimed.config.admin_password, config.admin_password);
    assert.equal(
      (
        await worker("/update", {
          id: claimed.id,
          epoch: claimed.epoch,
          status: "Completed",
          step: "Verified fixture",
          progress: 100,
          result: { address: server.host },
        })
      ).statusCode,
      200,
    );
    assert.equal(store.snapshot().servers.length, 0);
    assert.equal(store.snapshot().jobs[0].config_secret, undefined);
    assert.equal(store.snapshot().jobs[0].result, undefined);
    assert.equal(
      (await req("/jobs", "POST", payload, headers)).json().id,
      queued.json().id,
    );
    for (const outcome of ["Failed", "Cancelled", "Expired", "Recovery"]) {
      const p = await prove();
      const q = await req("/jobs", "POST", p, headers);
      assert.equal(q.statusCode, 202, q.body);
      if (outcome === "Cancelled")
        await req("/jobs/" + q.json().id + "/cancel", "POST", {}, headers);
      else if (outcome === "Expired") {
        await store.transaction((d) => {
          d.jobs.find((j: any) => j.id === q.json().id).config_expires_at = 0;
        });
        await worker("/claim");
      } else {
        const c = (await worker("/claim")).json();
        if (outcome === "Recovery") {
          await store.transaction((d) => {
            d.jobs.find((j: any) => j.id === c.id).lease_until =
              "2000-01-01T00:00:00.000Z";
          });
          await worker("/claim");
        } else
          await worker("/update", {
            id: c.id,
            epoch: c.epoch,
            status: "Failed",
            step: "Fixture failed",
            progress: 0,
          });
      }
      assert.equal(store.snapshot().servers.length, 0, outcome);
      const finished = store
        .snapshot()
        .jobs.find((j: any) => j.id === q.json().id);
      assert.equal(finished.connection_removed, true, outcome);
      assert.equal(finished.config_secret, undefined, outcome);
    }
    // Force a rolling backup while a temporary connection is active.
    const last = await req("/jobs", "POST", await prove(), headers);
    for (let i = 0; i < 51; i++) await store.transaction(() => {});
    const backups = [
      join(dir, "data", "database.previous.json"),
      ...(await readdir(join(dir, "data", "backups"))).map((x) =>
        join(dir, "data", "backups", x),
      ),
    ];
    for (const path of backups) {
      const text = await readFile(path, "utf8"),
        data = JSON.parse(text);
      assert.equal(data.servers.length, 0, path);
      assert.equal(data.probes.length, 0, path);
      assert(!text.includes(server.host), path);
      assert(!text.includes(server.password!), path);
    }
    await req("/jobs/" + last.json().id + "/cancel", "POST", {}, headers);
    assert.equal(store.snapshot().servers.length, 0);
    assert(store.snapshot().jobs.every((j: any) => j.connection_removed));
    assert(
      !(await readFile(join(dir, "data", "database.json"), "utf8")).includes(
        server.host,
      ),
    );
  } finally {
    if (old === undefined) delete process.env.ENABLE_INSTALLERS;
    else process.env.ENABLE_INSTALLERS = old;
    await app.close();
    await internal.close();
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
