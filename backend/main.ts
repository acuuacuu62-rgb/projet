import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Store } from "./store";
import { Vault, token } from "./security";
import { createApp } from "./app";
const data = resolve(process.env.DATA_DIR || ".data");
const keys = resolve(process.env.KEY_DIR || data + "/keys");
await mkdir(keys, { recursive: true, mode: 0o700 });
let workerToken: string;
try {
  workerToken = (await readFile(keys + "/worker.token", "utf8")).trim();
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
  workerToken = token();
  await writeFile(keys + "/worker.token", workerToken, {
    mode: 0o600,
    flag: "wx",
  });
}
const store = await new Store(data).init();
const vault = await new Vault().init(keys);
const origins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.APP_ORIGIN ||
  "http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim());
const { app, internal } = await createApp(store, vault, {
  origins,
  workerToken,
  production: process.env.NODE_ENV === "production",
});
await internal.listen({
  host: "127.0.0.1",
  port: Number(process.env.INTERNAL_PORT || 4001),
});
await app.listen({
  host: process.env.API_HOST || "127.0.0.1",
  port: Number(process.env.API_PORT || 4000),
});
console.log(
  "ZetaInstall API ready; persistent storage initialized; internal worker endpoint is loopback only.",
);
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, async () => {
    await app.close();
    await internal.close();
    await store.close();
    process.exit(0);
  });
