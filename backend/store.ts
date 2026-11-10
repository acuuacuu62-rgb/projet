import {
  mkdir,
  open,
  readFile,
  rename,
  chmod,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { databaseSchema, freshDatabase, type Database } from "../lib/contracts";
export class Store {
  private data: Database = freshDatabase();
  private pending: Promise<unknown> = Promise.resolve();
  private release?: () => Promise<void>;
  private healthy = true;
  constructor(public dir: string) {}
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await chmod(this.dir, 0o700);
    this.release = await lockfile.lock(this.dir, {
      stale: 60000,
      update: 10000,
      retries: 0,
      onCompromised: () => {
        this.healthy = false;
      },
    });
    try {
      this.data = databaseSchema.parse(
        JSON.parse(
          await readFile(path.join(this.dir, "database.json"), "utf8"),
        ),
      ) as Database;
    } catch (e: any) {
      if (e.code !== "ENOENT")
        throw new Error(
          "Database is invalid. Restore a verified backup; automatic reset refused.",
        );
      await this.persist(this.data);
    }
    return this;
  }
  get ready() {
    return this.healthy;
  }
  snapshot(): Database {
    if (!this.healthy) throw new Error("Storage requires recovery");
    return structuredClone(this.data);
  }
  async transaction<T>(fn: (d: Database) => T): Promise<T> {
    const next = this.pending.then(async () => {
      if (!this.healthy) throw new Error("Storage lock lost");
      const d = this.snapshot();
      const result = fn(d);
      d.revision++;
      databaseSchema.parse(d);
      try {
        await this.persist(d);
      } catch (e) {
        this.healthy = false;
        throw e;
      }
      this.data = d;
      return structuredClone(result);
    });
    this.pending = next.catch(() => {});
    return next;
  }
  private async atomic(file: string, content: string) {
    const tmp = file + "." + crypto.randomUUID() + ".tmp";
    const f = await open(tmp, "wx", 0o600);
    try {
      await f.writeFile(content);
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(tmp, file);
    const parent = await open(this.dir, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  private backupContent() {
    const d = this.snapshot();
    d.sessions = [];
    d.auth_tokens = [];
    for (const j of d.jobs) delete j.config_secret;
    return JSON.stringify(d);
  }
  private async persist(d: Database) {
    const target = path.join(this.dir, "database.json");
    const backups = path.join(this.dir, "backups");
    await mkdir(backups, { mode: 0o700, recursive: true });
    if (d.revision > 0) {
      await this.atomic(
        path.join(this.dir, "database.previous.json"),
        this.backupContent(),
      );
      if (d.revision % 50 === 0) {
        const f = await open(
          path.join(backups, `${Date.now()}.json`),
          "wx",
          0o600,
        );
        try {
          await f.writeFile(this.backupContent());
          await f.sync();
        } finally {
          await f.close();
        }
        const names = (await readdir(backups))
          .filter((n) => /^\d+\.json$/.test(n))
          .sort();
        for (const n of names.slice(0, -24))
          await unlink(path.join(backups, n));
      }
    }
    const content = JSON.stringify(d);
    if (Buffer.byteLength(content) > 25 * 1024 * 1024)
      throw new Error(
        "Storage capacity reached. Migrate or archive before accepting new data.",
      );
    await this.atomic(target, content);
  }
  async close() {
    await this.pending;
    await this.release?.();
  }
}
