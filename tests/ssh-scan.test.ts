import { test } from "node:test";
import assert from "node:assert/strict";
import ssh2 from "ssh2";
import net from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { scanHost, scanSSHAddress, scanFailure } from "../backend/ssh";
import { fingerprint } from "../backend/security";
const key = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey;
async function sshServer(password?: string) {
  const privateKey = key();
  let auth = 0;
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      auth++;
      if (password && ctx.method === "password" && ctx.password === password)
        ctx.accept();
      else ctx.reject();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as net.AddressInfo).port;
  const parsed = ssh2.utils.parseKey(privateKey);
  assert(!(parsed instanceof Error));
  return {
    server,
    port,
    fingerprint: fingerprint(parsed.getPublicSSH()),
    auth: () => auth,
  };
}
const close = (s: net.Server) => new Promise<void>((r) => s.close(() => r()));
test("scan two SSH hosts repeatedly without authentication or reusing fingerprints", async () => {
  const first = await sshServer(),
    second = await sshServer();
  try {
    for (const target of [first, second, first, second]) {
      const result = await scanSSHAddress("127.0.0.1", target.port);
      assert.equal(result.fingerprint, target.fingerprint);
    }
    assert.notEqual(first.fingerprint, second.fingerprint);
    assert.equal(first.auth(), 0);
    assert.equal(second.auth(), 0);
  } finally {
    await close(first.server);
    await close(second.server);
  }
});
test("scan rejects closed ports and early disconnects and always times out on silent peers", async () => {
  const unused = net.createServer();
  unused.listen(0, "127.0.0.1");
  await once(unused, "listening");
  const port = (unused.address() as net.AddressInfo).port;
  await close(unused);
  await assert.rejects(scanSSHAddress("127.0.0.1", port), /refused/);
  const sockets = new Set<net.Socket>();
  const silent = net.createServer((s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  silent.listen(0, "127.0.0.1");
  await once(silent, "listening");
  try {
    await assert.rejects(
      scanSSHAddress(
        "127.0.0.1",
        (silent.address() as net.AddressInfo).port,
        150,
      ),
      /SSH handshake timed out/,
    );
  } finally {
    for (const s of sockets) s.destroy();
    await close(silent);
  }
  const early = net.createServer((s) => {
    s.resume();
    s.end();
  });
  early.listen(0, "127.0.0.1");
  await once(early, "listening");
  try {
    await assert.rejects(
      scanSSHAddress(
        "127.0.0.1",
        (early.address() as net.AddressInfo).port,
        500,
      ),
      /closed|reset/,
    );
  } finally {
    await close(early);
  }
});
test("public scan still blocks private addresses and error messages never echo raw remote data", async () => {
  await assert.rejects(scanHost("127.0.0.1", 22), /Only public unicast/);
  assert.match(scanFailure({ code: "ENETUNREACH" }), /unreachable/);
  assert.match(
    scanFailure({ message: "Handshake failed: no matching key secret-value" }),
    /algorithm/,
  );
  assert(
    !scanFailure({ message: "password secret-value" }).includes("secret-value"),
  );
});

test("authenticated connection rejects a graceful close instead of hanging", async () => {
  const { authenticateSSH } = await import("../backend/ssh");
  const early = net.createServer((s) => {
    s.resume();
    s.end("SSH-2.0-fixture\r\n");
  });
  early.listen(0, "127.0.0.1");
  await once(early, "listening");
  try {
    const outcome = await Promise.race([
      authenticateSSH({
        host: "127.0.0.1",
        port: (early.address() as net.AddressInfo).port,
        username: "fixture",
        readyTimeout: 200,
      }).then(
        (c) => {
          c.destroy();
          return "resolved";
        },
        () => "rejected",
      ),
      new Promise<string>((r) => setTimeout(() => r("hung"), 500)),
    ]);
    assert.equal(outcome, "rejected");
  } finally {
    await close(early);
  }
});

test("TCP timeout is distinguished from a stalled SSH handshake without echoing remote errors", () => {
  assert.match(
    scanFailure({ code: "ETIMEDOUT" }, false),
    /TCP connection timed out before SSH started/,
  );
  assert.match(
    scanFailure({ code: "ETIMEDOUT" }, true),
    /SSH handshake timed out/,
  );
});
test("two authenticated hosts retain pinned identities and failures release sockets", async () => {
  const { authenticateSSH } = await import("../backend/ssh");
  const first = await sshServer("fixture-password"),
    second = await sshServer("fixture-password");
  try {
    for (const target of [first, second, first, second]) {
      const config = {
        host: "127.0.0.1",
        port: target.port,
        username: "fixture",
        password: "fixture-password",
        readyTimeout: 1000,
        hostVerifier: (key: Buffer) => fingerprint(key) === target.fingerprint,
      };
      const client = await authenticateSSH(config);
      const closed = once(client, "close");
      client.end();
      await closed;
      await assert.rejects(
        authenticateSSH({ ...config, password: "wrong-password" }),
        /authentication or host key/,
      );
      await assert.rejects(
        authenticateSSH({ ...config, hostVerifier: () => false }),
        /authentication or host key/,
      );
    }
  } finally {
    await close(first.server);
    await close(second.server);
  }
});
