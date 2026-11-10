import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../backend/store";
import { Vault } from "../../backend/security";
import { createApp } from "../../backend/app";
test("password reset and verification via actual local Resend emulator", async () => {
  const config = JSON.parse(
    await readFile(
      process.env.HOME + "/runtime/emulate-config/zetainstall-email.json",
      "utf8",
    ),
  );
  Object.assign(process.env, config);
  const dir = await mkdtemp(join(tmpdir(), "zeta-email-"));
  const store = await new Store(join(dir, "db")).init();
  const vault = await new Vault().init(join(dir, "keys"));
  const { app, internal } = await createApp(store, vault, {
    origins: ["http://localhost:3000"],
    workerToken: "synthetic",
  });
  const req = (path: string, payload: any, headers: any = {}) =>
    app.inject({
      url: "/v1" + path,
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        ...headers,
      },
      payload,
    });
  try {
    const email = `zeta-${crypto.randomUUID()}@example.test`;
    const registered = await req("/auth/register", {
      name: "Email Test",
      email,
      password: "synthetic-initial-pass",
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const auth = {
      cookie: registered.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": registered.json().csrf,
    };
    const verified = await req("/auth/send-verification", {}, auth);
    assert.equal(verified.statusCode, 200, verified.body);
    const headers = { Authorization: "Bearer " + config.RESEND_API_KEY };
    async function latestToken(subject: string) {
      const list = (await (
        await fetch(config.RESEND_BASE_URL + "/emails", { headers })
      ).json()) as any;
      for (const item of list.data) {
        const detail = (await (
          await fetch(config.RESEND_BASE_URL + "/emails/" + item.id, {
            headers,
          })
        ).json()) as any;
        if (
          detail.subject === subject &&
          (Array.isArray(detail.to) ? detail.to : [detail.to]).includes(email)
        ) {
          const token = detail.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
          if (token) return token;
        }
      }
      throw new Error("Expected email not captured");
    }
    const verifyToken = await latestToken("Verify your ZetaInstall email");
    assert.equal(
      (await req("/auth/verify-email", { token: verifyToken })).statusCode,
      200,
    );
    assert.equal(
      (await req("/auth/verify-email", { token: verifyToken })).statusCode,
      400,
    );
    const reset = await req("/auth/forgot-password", { email });
    assert.equal(reset.statusCode, 200, reset.body);
    const resetToken = await latestToken("Reset your ZetaInstall password");
    assert.equal(
      (
        await req("/auth/reset-password", {
          token: resetToken,
          password: "synthetic-replaced-pass",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await req("/auth/reset-password", {
          token: resetToken,
          password: "synthetic-replaced-pass",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await req("/auth/login", { email, password: "synthetic-initial-pass" }))
        .statusCode,
      401,
    );
    assert.equal(
      (await req("/auth/login", { email, password: "synthetic-replaced-pass" }))
        .statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: "/v1/keys", headers: auth })).statusCode,
      401,
    );
  } finally {
    await app.close();
    await internal.close();
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
