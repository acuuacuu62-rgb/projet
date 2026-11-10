import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../backend/store";
import { Vault } from "../backend/security";
import { createApp } from "../backend/app";

test("worker lease recovery, safe retries and administrator controls preserve boundaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-operations-"));
  const store = await new Store(join(dir, "data")).init();
  const vault = await new Vault().init(join(dir, "keys"));
  const { app, internal } = await createApp(store, vault, {
    origins: ["http://localhost:3000"],
    workerToken: "synthetic-only",
  });
  const origin = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  let auth: Record<string, string> = {};
  const req = (url: string, method: any = "GET", payload?: any) =>
    app.inject({
      url: "/v1" + url,
      method,
      payload,
      headers: { ...origin, ...auth },
    });
  const work = (url: string, payload = {}) =>
    internal.inject({
      url,
      method: "POST",
      payload,
      headers: { authorization: "Bearer synthetic-only" },
    });
  try {
    const a = await req("/auth/register", "POST", {
      name: "Operator Test",
      email: "operator@example.test",
      password: "synthetic-operation-password",
    });
    assert.equal(a.statusCode, 201, a.body);
    const user = a.json().user;
    auth = {
      cookie: a.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": a.json().csrf,
    };
    assert.equal(
      (
        await req("/admin/settings", "PATCH", {
          maintenance: true,
          registration_enabled: false,
        })
      ).statusCode,
      403,
    );
    await store.transaction((d) => {
      d.users[0].role = "administrator";
      d.servers.push({
        id: "fixture-server",
        user_id: user.id,
        created_at: new Date().toISOString(),
        name: "Synthetic SSH fixture",
        host: "8.8.8.8",
        ip: "8.8.8.8",
        port: 22,
        username: "root",
        provider: "Other Provider",
        mode: "universal",
        auth: "password",
        credential: vault.seal(
          '{"password":"synthetic-not-a-real-host"}',
          user.id,
          "connection",
        ),
      });
    });
    assert.equal(
      (await req("/admin/users/" + user.id, "PATCH", { status: "suspended" }))
        .statusCode,
      400,
    );
    const first = await req("/jobs", "POST", {
      server_id: "fixture-server",
      type: "diagnostics",
      config: {},
      idempotency_key: "first-synthetic-job-123",
    });
    assert.equal(first.statusCode, 202, first.body);
    const claimed = await work("/claim");
    assert.equal(claimed.json().id, first.json().id);
    assert.equal((await work("/claim")).json(), null);
    const epoch = claimed.json().epoch;
    assert.equal(
      (await work("/heartbeat", { id: first.json().id, epoch: epoch + 1 }))
        .statusCode,
      409,
    );
    await store.transaction((d) => {
      d.jobs[0].lease_until = new Date(Date.now() - 1000).toISOString();
    });
    assert.equal((await work("/claim")).json(), null);
    assert.equal(store.snapshot().jobs[0].status, "Failed");
    assert.equal(store.snapshot().jobs[0].config_secret, undefined);
    assert.equal(store.snapshot().servers[0].recovery_required, true);
    assert.equal(
      (
        await work("/update", {
          id: first.json().id,
          epoch,
          status: "Completed",
          step: "stale",
          progress: 100,
        })
      ).statusCode,
      409,
    );
    const retry = await req("/jobs/" + first.json().id + "/retry", "POST", {});
    assert.equal(retry.statusCode, 200, retry.body);
    const second = await work("/claim");
    const completed = await work("/update", {
      id: retry.json().id,
      epoch: second.json().epoch,
      status: "Completed",
      step: "Synthetic boundary check",
      progress: 100,
      result: { verified_at: new Date().toISOString() },
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(store.snapshot().servers[0].recovery_required, false);
    assert.equal(store.snapshot().jobs[1].config_secret, undefined);
    const target = await req("/auth/register", "POST", {
      name: "Suspension Target",
      email: "target@example.test",
      password: "synthetic-target-password",
    });
    const tid = target.json().user.id;
    await store.transaction((d) =>
      d.servers.push({
        ...d.servers[0],
        id: "target-server",
        user_id: tid,
        credential: vault.seal(
          '{"password":"synthetic-target"}',
          tid,
          "connection",
        ),
      }),
    );
    const targetHeaders = {
      ...origin,
      cookie: target.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": target.json().csrf,
    };
    const pending = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: targetHeaders,
      payload: {
        server_id: "target-server",
        type: "diagnostics",
        config: {},
        idempotency_key: "target-pending-job-123",
      },
    });
    assert.equal(pending.statusCode, 202, pending.body);
    assert.equal(
      (await req("/admin/users/" + tid, "PATCH", { status: "suspended" }))
        .statusCode,
      200,
    );
    assert.equal(
      store.snapshot().jobs.find((j: any) => j.id === pending.json().id).status,
      "Cancelled",
    );
    assert.equal(
      store.snapshot().jobs.find((j: any) => j.id === pending.json().id)
        .config_secret,
      undefined,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/v1/servers",
          headers: targetHeaders,
        })
      ).statusCode,
      401,
    );
    const settings = await req("/admin/settings", "PATCH", {
      maintenance: true,
      registration_enabled: false,
    });
    assert.equal(settings.statusCode, 200, settings.body);
    assert.equal(
      (await req("/jobs/" + first.json().id + "/retry", "POST", {})).statusCode,
      503,
    );
    assert.equal(
      (
        await req("/jobs", "POST", {
          server_id: "fixture-server",
          type: "diagnostics",
          config: {},
          idempotency_key: "maintenance-new-job-123",
        })
      ).statusCode,
      503,
    );
    const registration = await req("/auth/register", "POST", {
      name: "Blocked",
      email: "blocked@example.test",
      password: "synthetic-blocked-password",
    });
    assert.equal(registration.statusCode, 503);
    const metadata = (await req("/admin")).json();
    assert.equal(metadata.users[0].password_hash, undefined);
    assert.equal(metadata.jobs[0].config_secret, undefined);
    assert.equal(
      JSON.stringify(metadata).includes("synthetic-not-a-real-host"),
      false,
    );
  } finally {
    await app.close();
    await internal.close();
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
