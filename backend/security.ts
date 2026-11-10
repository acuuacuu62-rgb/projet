import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import ipaddr from "ipaddr.js";
import sodium from "libsodium-wrappers-sumo";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
export const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export const fingerprint = (b: Buffer) =>
  "SHA256:" +
  createHash("sha256").update(b).digest("base64").replace(/=+$/, "");
export function publicIP(address: string) {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function destination(host: string) {
  if (
    !host ||
    host.includes("/") ||
    host.includes("@") ||
    host.includes("%") ||
    host.length > 253
  )
    throw new Error("Invalid SSH host");
  const ips = await lookup(host, { all: true, verbatim: true });
  if (!ips.length || ips.some((x) => !publicIP(x.address)))
    throw new Error(
      "Only public unicast addresses are allowed. Private, reserved, loopback and metadata addresses are blocked.",
    );
  return ips[0].address;
}
export class Vault {
  private key!: Uint8Array;
  async init(dir: string) {
    await sodium.ready;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const file = path.join(dir, "vault.key");
    try {
      this.key = await readFile(file);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      this.key = randomBytes(32);
      await writeFile(file, this.key, { flag: "wx", mode: 0o600 });
    }
    if (this.key.length !== 32) throw new Error("Invalid vault key");
    return this;
  }
  seal(value: string, owner: string, purpose: string) {
    const nonce = randomBytes(24);
    return {
      nonce: nonce.toString("base64"),
      ciphertext: Buffer.from(
        sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          value,
          `${owner}:${purpose}`,
          null,
          nonce,
          this.key,
        ),
      ).toString("base64"),
      purpose,
    };
  }
  open(e: any, owner: string) {
    return Buffer.from(
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        Buffer.from(e.ciphertext, "base64"),
        `${owner}:${e.purpose}`,
        Buffer.from(e.nonce, "base64"),
        this.key,
      ),
    ).toString();
  }
}
export function redact(s: string, secrets: string[] = []) {
  let t = s
    .replace(
      /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[^\n]*PRIVATE KEY-----/g,
      "[REDACTED KEY]",
    )
    .replace(/(Bearer\s+)[\w.\-]+/gi, "$1[REDACTED]");
  for (const v of secrets.filter((v) => v.length > 3))
    t = t.split(v).join("[REDACTED]");
  return t.slice(0, 8000);
}
