import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../backend/store";
import { Vault, publicIP, destination, redact } from "../backend/security";
import { generateSSHKey } from "../backend/keys";
import { validateJobConfig } from "../backend/app";
import { serverSchema } from "../lib/contracts";

test("SSRF policy rejects internal, mapped, reserved and metadata addresses", async () => {
  for (const ip of [
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "203.0.113.1",
  ])
    assert.equal(publicIP(ip), false, ip);
  assert.equal(publicIP("8.8.8.8"), true);
  await assert.rejects(destination("127.0.0.1"));
  await assert.rejects(destination("http://example.com"));
});
test("vault binds authenticated encryption to owner and purpose", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-vault-"));
  try {
    const v = await new Vault().init(dir);
    const e = v.seal("synthetic-secret", "owner-a", "ssh");
    assert.equal(v.open(e, "owner-a"), "synthetic-secret");
    assert.throws(() => v.open(e, "owner-b"));
    assert.throws(() => v.open({ ...e, purpose: "other" }, "owner-a"));
    assert(!JSON.stringify(e).includes("synthetic-secret"));
    const restored = await new Vault().init(dir);
    assert.equal(restored.open(e, "owner-a"), "synthetic-secret");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("JSON repository serializes concurrent mutations and survives reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-db-"));
  const db = await new Store(dir).init();
  try {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        db.transaction((d) =>
          d.activity_logs.push({
            id: String(i),
            user_id: "u",
            created_at: new Date().toISOString(),
            action: "test",
          }),
        ),
      ),
    );
    assert.equal(db.snapshot().revision, 30);
    assert.equal(db.snapshot().activity_logs.length, 30);
    await assert.rejects(
      db.transaction((d) => {
        d.schema_version = 2 as any;
      }),
    );
    assert.equal(db.snapshot().revision, 30);
    await assert.rejects(new Store(dir).init());
    await db.close();
    const reopened = await new Store(dir).init();
    assert.equal(reopened.snapshot().activity_logs.length, 30);
    await reopened.close();
  } finally {
    await db.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
test("corrupt database never silently resets to empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-corrupt-"));
  await writeFile(join(dir, "database.json"), "{bad");
  const s = new Store(dir);
  try {
    await assert.rejects(s.init(), /Database is invalid/);
    assert.equal(await readFile(join(dir, "database.json"), "utf8"), "{bad");
  } finally {
    await s.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
test("OpenSSH interoperates with generated Ed25519 and RSA4096, including passphrases", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-keys-"));
  try {
    for (const algo of ["ed25519", "rsa"] as const) {
      const pair = await generateSSHKey(algo, "synthetic-passphrase");
      const file = join(dir, algo);
      await writeFile(file, pair.private, { mode: 0o600 });
      const pub = execFileSync(
        "ssh-keygen",
        ["-y", "-P", "synthetic-passphrase", "-f", file],
        { encoding: "utf8" },
      ).trim();
      assert.equal(
        pub.split(" ").slice(0, 2).join(" "),
        pair.public.split(" ").slice(0, 2).join(" "),
      );
      if (algo === "rsa") {
        const details = execFileSync("ssh-keygen", ["-lf", file], {
          encoding: "utf8",
        });
        assert.match(details, /4096/);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("configuration validates domains, commands, ports and mode ownership", () => {
  assert.throws(() =>
    validateJobConfig("install_panel", {
      domain: "x.com;touch /tmp/pwned",
      email: "x@y.com",
      admin_name: "admin",
      admin_password: "longpassword123",
      ssl: true,
      consent: true,
    }),
  );
  assert.throws(() => validateJobConfig("diagnostics", { command: "whoami" }));
  assert.throws(() =>
    serverSchema.parse({
      name: "x1",
      provider: "AWS",
      mode: "upcloud",
      host: "8.8.8.8",
      port: 22,
      username: "root",
      auth: "password",
      password: "x",
    }),
  );
  assert.throws(() =>
    serverSchema.parse({
      name: "x1",
      provider: "AWS",
      mode: "universal",
      host: "8.8.8.8",
      port: 70000,
      username: "root;id",
      auth: "password",
      password: "x",
    }),
  );
});
test("secret redaction removes private key and bearer material", () => {
  assert(
    !redact("Bearer abc-def password=known-secret", ["known-secret"]).includes(
      "known-secret",
    ),
  );
  assert(
    !redact(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nsensitive\n-----END OPENSSH PRIVATE KEY-----",
    ).includes("sensitive"),
  );
});

test("a failed durable write stops further reads and writes instead of serving stale success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-fail-stop-"));
  const db = await new Store(dir).init();
  try {
    await rm(join(dir, "database.json"));
    await mkdir(join(dir, "database.json"));
    await assert.rejects(
      db.transaction((d) => {
        d.revision += 1;
      }),
    );
    assert.equal(db.ready, false);
    assert.throws(() => db.snapshot(), /recovery/);
    await assert.rejects(
      db.transaction(() => {}),
      /lock lost/,
    );
  } finally {
    await db.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage schema rejects plaintext credentials, malformed jobs and duplicate identities", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zeta-schema-"));
  const db = await new Store(dir).init();
  try {
    await assert.rejects(
      db.transaction((d) =>
        d.users.push({
          id: "u",
          user_id: "u",
          created_at: new Date().toISOString(),
          email: "x@example.test",
          name: "Test",
          password_hash: "plaintext",
          role: "user",
          status: "active",
        }),
      ),
    );
    await assert.rejects(
      db.transaction((d) =>
        d.jobs.push({
          id: "j",
          user_id: "u",
          created_at: new Date().toISOString(),
          status: "Completed",
        }),
      ),
    );
    await assert.rejects(
      db.transaction((d) => {
        const row = {
          id: "same",
          user_id: "u",
          created_at: new Date().toISOString(),
          action: "test",
        };
        d.activity_logs.push(row, row);
      }),
    );
    assert.equal(db.snapshot().revision, 0);
    assert.equal(db.ready, true);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
