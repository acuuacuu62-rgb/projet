import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../backend/store";
import { Vault, hash } from "../backend/security";
import { createApp } from "../backend/app";

test("real API auth, CSRF, encryption, ownership, dedup, cancellation and role boundaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-api-"));
  const store = await new Store(join(dir, "data")).init();
  const vault = await new Vault().init(join(dir, "keys"));
  const { app, internal } = await createApp(store, vault, {
    origins: ["http://localhost:3000"],
    workerToken: "synthetic-worker-token",
  });
  await app.ready();
  const origin = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  const req = (
    url: string,
    method: any = "GET",
    payload?: any,
    headers: any = {},
  ) =>
    app.inject({
      url: "/v1" + url,
      method,
      payload,
      headers: { ...origin, ...headers },
    });
  try {
    const a = await req("/auth/register", "POST", {
      name: "Alice Test",
      email: "alice@example.test",
      password: "synthetic-password-123",
    });
    assert.equal(a.statusCode, 201, a.body);
    const aj = a.json();
    const ah = {
      cookie: a.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": aj.csrf,
    };
    assert.equal(
      (await req("/session", "GET", undefined, ah)).json().user.email,
      "alice@example.test",
    );
    const b = await req("/auth/register", "POST", {
      name: "Bob Test",
      email: "bob@example.test",
      password: "synthetic-password-456",
    });
    assert.equal(b.statusCode, 201, b.body);
    const bh = {
      cookie: b.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": b.json().csrf,
    };
    assert.equal(
      (await req("/me", "PATCH", { name: "Eve" }, { cookie: ah.cookie }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await req(
          "/me",
          "PATCH",
          { name: "Eve" },
          { ...ah, origin: "https://evil.example" },
        )
      ).statusCode,
      403,
    );
    assert.equal((await req("/admin", "GET", undefined, ah)).statusCode, 403);
    const key = await req(
      "/keys",
      "POST",
      {
        name: "test-key",
        algorithm: "ed25519",
        description: "Integration test",
        consent: true,
      },
      ah,
    );
    assert.equal(key.statusCode, 201, key.body);
    assert.match(key.json().private_key, /PRIVATE KEY/);
    const kid = key.json().id;
    const keylist = await req("/keys", "GET", undefined, ah);
    assert.equal(keylist.json()[0].private_key, undefined);
    assert.equal(keylist.json()[0].secret, undefined);
    assert(
      !JSON.stringify(store.snapshot()).includes("BEGIN OPENSSH PRIVATE KEY"),
    );
    assert.equal(
      (
        await req(
          "/keys/" + kid + "/export",
          "POST",
          { password: "synthetic-password-456" },
          bh,
        )
      ).statusCode,
      404,
    );
    assert.equal((await req("/keys/" + kid, "DELETE", {}, bh)).statusCode, 404);
    assert.equal(
      (await req("/keys/" + kid + "/export", "POST", { password: "wrong" }, ah))
        .statusCode,
      403,
    );
    const server = {
      id: "test-server",
      user_id: aj.user.id,
      created_at: new Date().toISOString(),
      name: "test",
      host: "8.8.8.8",
      ip: "8.8.8.8",
      port: 22,
      provider: "Other Provider",
      auth: "password",
      credential: vault.seal(
        '{"password":"synthetic"}',
        aj.user.id,
        "connection",
      ),
    };
    await store.transaction((d) => {
      d.servers.push(server);
    });
    assert.equal(
      (await req("/servers/test-server", "PATCH", { name: "attacker" }, bh))
        .statusCode,
      404,
    );
    assert.equal(
      (await req("/servers", "GET", undefined, bh)).json().length,
      0,
    );
    const workspace = (await req("/workspace", "GET", undefined, ah)).json();
    assert.equal(workspace.user.id, aj.user.id);
    assert.equal(workspace.servers[0].credential, undefined);
    assert.equal(workspace.keys[0].secret, undefined);
    assert.equal(
      (await req("/workspace", "GET", undefined, bh)).json().servers.length,
      0,
    );
    assert.equal((await req("/workspace")).json().user, null);

    const payload = {
      server_id: "test-server",
      type: "diagnostics",
      config: {},
      idempotency_key: "synthetic-idempotent-key-123",
    };
    const job = await req("/jobs", "POST", payload, ah);
    assert.equal(job.statusCode, 202, job.body);
    assert.equal(job.json().config_secret, undefined);
    const dup = await req("/jobs", "POST", payload, ah);
    assert.equal(dup.json().id, job.json().id);
    assert.equal(
      (await req("/jobs", "POST", { ...payload, type: "firewall_check" }, ah))
        .statusCode,
      409,
    );
    assert.equal(
      (await req("/jobs/" + job.json().id + "/cancel", "POST", {}, bh))
        .statusCode,
      404,
    );
    assert.equal(
      (await req("/jobs/" + job.json().id + "/cancel", "POST", {}, ah))
        .statusCode,
      200,
    );
    assert.equal(store.snapshot().jobs[0].status, "Cancelled");
    assert.equal(
      (
        await req(
          "/connections/scan",
          "POST",
          { host: "169.254.169.254", port: 22 },
          ah,
        )
      ).statusCode,
      422,
    );
    assert.equal((await req("/auth/logout", "POST", {}, ah)).statusCode, 200);
    assert.equal((await req("/keys", "GET", undefined, ah)).statusCode, 401);
    assert.equal(
      (
        await req("/auth/login", "POST", {
          email: "alice@example.test",
          password: "wrong",
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await req("/auth/login", "POST", {
          email: "alice@example.test",
          password: "synthetic-password-123",
        })
      ).statusCode,
      200,
    );
    const internalUnauth = await internal.inject({
      method: "POST",
      url: "/claim",
      payload: {},
    });
    assert.equal(internalUnauth.statusCode, 401);
  } finally {
    await app.close();
    await internal.close();
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
