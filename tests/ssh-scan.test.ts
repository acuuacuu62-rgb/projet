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
async function sshServer() {
  const privateKey = key();
  let auth = 0;
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      auth++;
      ctx.reject();
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
      /timed out/,
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
