import { z } from "zod";
export const providers = [
  "UpCloud",
  "AWS",
  "DigitalOcean",
  "Vultr",
  "Hetzner",
  "Contabo",
  "Linode / Akamai",
  "Oracle Cloud",
  "Google Cloud",
  "Microsoft Azure",
  "OVHcloud",
  "Tencent Cloud",
  "Alibaba Cloud",
  "Other Provider",
] as const;
export const serverSchema = z
  .object({
    name: z.string().trim().min(2).max(70),
    provider: z.enum(providers),
    mode: z.enum(["universal", "upcloud"]),
    host: z.string().trim().max(253),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$|^root$/),
    auth: z.enum(["key", "password"]),
    key_id: z.string().optional(),
    password: z.string().min(1).max(1024).optional(),
    passphrase: z.string().max(1024).optional(),
    description: z.string().max(500).default(""),
    fingerprint: z
      .string()
      .regex(/^SHA256:[A-Za-z0-9+/]{43}$/)
      .optional(),
  })
  .strict()
  .refine(
    (s) => s.mode !== "upcloud" || s.provider === "UpCloud",
    "UpCloud mode requires UpCloud provider",
  );
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Enter a valid fully qualified domain",
  );
export const jobTypes = [
  "diagnostics",
  "install_panel",
  "install_wings",
  "configure_wings",
  "upcloud_setup",
  "firewall_check",
  "ssl_check",
  "key_install",
  "certificate_issue",
  "certificate_renew",
  "repair_service",
] as const;
export const terminal = ["Completed", "Failed", "Cancelled"];
export type RecordData = {
  id: string;
  user_id: string;
  created_at: string;
  [key: string]: any;
};
export type Database = {
  schema_version: 1;
  revision: number;
  [key: string]: any;
};
export const collections = [
  "users",
  "sessions",
  "servers",
  "ssh_keys",
  "installations",
  "nodes",
  "domains",
  "certificates",
  "activity_logs",
  "settings",
  "jobs",
  "probes",
  "secrets",
  "auth_tokens",
  "plans",
] as const;
export function freshDatabase(): Database {
  return {
    schema_version: 1,
    revision: 0,
    ...Object.fromEntries(collections.map((k) => [k, []])),
  };
}
const row = z
  .object({ id: z.string(), user_id: z.string(), created_at: z.string() })
  .passthrough();
const encrypted = z
  .object({
    nonce: z.string().regex(/^[A-Za-z0-9+/]{32}$/),
    ciphertext: z.string().min(24),
    purpose: z.string().min(1),
  })
  .strict();
const timestamp = z.iso.datetime();
const storedSchemas: Record<string, z.ZodType> = {
  users: row.extend({
    email: z.email(),
    name: z.string().min(2),
    password_hash: z.string().startsWith("$argon2id$"),
    role: z.enum(["user", "administrator"]),
    status: z.enum(["active", "suspended"]),
  }),
  sessions: row.extend({
    token_hash: z.string().regex(/^[a-f0-9]{64}$/),
    csrf: z.string().min(32),
    expires_at: timestamp,
    last_seen_at: timestamp,
  }),
  servers: row
    .extend({
      host: z.string().min(1),
      ip: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      auth: z.enum(["key", "password"]),
      credential: encrypted,
    })
    .refine(
      (s) => !("password" in s) && !("passphrase" in s),
      "Server credentials must be encrypted",
    ),
  ssh_keys: row.extend({
    name: z.string().min(1),
    algorithm: z.enum(["ed25519", "rsa"]),
    public_key: z.string().min(20),
    fingerprint: z.string().startsWith("SHA256:"),
    secret: encrypted,
  }),
  jobs: row.extend({
    server_id: z.string().min(1),
    type: z.enum(jobTypes),
    status: z.enum([
      "Pending",
      "Connecting",
      "Preparing",
      "Installing",
      "Configuring",
      "Verifying",
      "Completed",
      "Failed",
      "Cancelled",
    ]),
    progress: z.number().min(0).max(100),
    logs: z.array(z.object({ at: timestamp, message: z.string().max(500) })),
    lease_epoch: z.number().int().nonnegative(),
    config_secret: encrypted.optional(),
  }),
  auth_tokens: row.extend({
    type: z.enum(["reset", "verify"]),
    token_hash: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: timestamp,
  }),
};
export const databaseSchema = z
  .object({
    schema_version: z.literal(1),
    revision: z.number().int().nonnegative(),
    ...Object.fromEntries(
      collections.map((k) => [k, z.array(storedSchemas[k] || row)]),
    ),
  })
  .strict()
  .superRefine((db, ctx) => {
    for (const table of collections) {
      const ids = new Set<string>();
      for (const item of (db as any)[table]) {
        if (ids.has(item.id))
          ctx.addIssue({
            code: "custom",
            path: [table],
            message: "Duplicate resource identity",
          });
        ids.add(item.id);
      }
    }
  });
