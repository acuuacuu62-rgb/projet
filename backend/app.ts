import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { generateSSHKey } from "./keys";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import tls from "node:tls";
import { emailConfigured, sendEmail } from "./mail";
import {
  serverSchema,
  domainSchema,
  jobTypes,
  terminal,
  type Database,
} from "../lib/contracts";
import { Store } from "./store";
import {
  Vault,
  token,
  hash,
  equal,
  destination,
  fingerprint,
} from "./security";
import { scanHost, connect, remote } from "./ssh";
import {
  installationProfiles,
  detectedProfile,
} from "../lib/installation-profiles";
const now = () => new Date().toISOString();
const row = (user_id: string, more: any = {}) => ({
  id: crypto.randomUUID(),
  user_id,
  created_at: now(),
  ...more,
});
const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  email_verified: !!u.verified_at,
  status: u.status,
});
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { statusCode: status });
const creds = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(2).max(70).optional(),
  })
  .strict();
const reauth = z.object({ password: z.string().max(128) });
const owned = (db: Database, table: string, id: string, user: string) => {
  const v = db[table].find((x: any) => x.id === id && x.user_id === user);
  if (!v) throw fail(404, "Resource not found");
  return v;
};
function audit(d: Database, user: string, action: string, resource_id = "") {
  d.activity_logs.push(row(user, { action, resource_id }));
  if (d.activity_logs.length > 10000)
    d.activity_logs.splice(0, d.activity_logs.length - 10000);
}
export async function createApp(
  store: Store,
  vault: Vault,
  opts: { origins: string[]; workerToken: string; production?: boolean },
) {
  const app = Fastify({ logger: false, bodyLimit: 262144 });
  await app.register(cookie);
  await app.register(cors, { origin: opts.origins, credentials: true });
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  const cookieName = opts.production ? "__Host-zeta_session" : "zeta_session";
  const cookieOptions = {
    httpOnly: true,
    secure: !!opts.production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 604800,
  };
  app.setErrorHandler((e: any, req, reply) => {
    const code = e instanceof z.ZodError ? 400 : e.statusCode || 500;
    reply.code(code).send({
      error:
        code >= 500
          ? "Service unavailable. Check server configuration and try again."
          : e instanceof z.ZodError
            ? e.issues
                .map((x: any) => `${x.path.join(".")}: ${x.message}`)
                .join("; ")
            : e.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !opts.origins.includes(origin))
        throw fail(403, "Untrusted request origin");
      if (!String(req.headers["content-type"]).startsWith("application/json"))
        throw fail(415, "JSON requests required");
    }
  });
  function session(req: FastifyRequest) {
    const raw = req.cookies[cookieName];
    if (!raw) throw fail(401, "Sign in to manage your infrastructure");
    const db = store.snapshot();
    const s = db.sessions.find(
      (s: any) =>
        s.token_hash === hash(raw) &&
        Date.parse(s.expires_at) > Date.now() &&
        Date.parse(s.last_seen_at) + 1800000 > Date.now(),
    );
    if (!s) throw fail(401, "Session expired. Sign in again.");
    const u = db.users.find(
      (u: any) => u.id === s.user_id && u.status !== "suspended",
    );
    if (!u) throw fail(401, "Account unavailable");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !equal(String(req.headers["x-csrf-token"] || ""), s.csrf)
    )
      throw fail(403, "Invalid security token. Refresh the page.");
    if (Date.parse(s.last_seen_at) + 60000 < Date.now())
      void store
        .transaction((d) => {
          const current = d.sessions.find((v: any) => v.id === s.id);
          if (current) current.last_seen_at = now();
        })
        .catch(() => {});
    return { u, s };
  }
  async function passwordCheck(req: FastifyRequest, pw: string) {
    const { u } = session(req);
    if (!(await argon2.verify(u.password_hash, pw)))
      throw fail(403, "Password confirmation failed");
    return u;
  }
  async function startSession(u: any, reply: FastifyReply) {
    const raw = token(),
      csrf = token();
    await store.transaction((d) => {
      d.sessions.push(
        row(u.id, {
          token_hash: hash(raw),
          csrf,
          expires_at: new Date(Date.now() + 604800000).toISOString(),
          last_seen_at: now(),
        }),
      );
      audit(d, u.id, "auth.login");
    });
    reply.setCookie(cookieName, raw, cookieOptions);
    return { user: safeUser(u), csrf };
  }
  async function emailToken(u: any, type: string) {
    if (!emailConfigured())
      throw fail(
        503,
        "Email delivery is not configured. Configure SMTP_URL on the backend.",
      );
    const raw = token();
    const item = row(u.id, {
      type,
      token_hash: hash(raw),
      expires_at: new Date(Date.now() + 1800000).toISOString(),
    });
    await store.transaction((d) => {
      d.auth_tokens = d.auth_tokens.filter(
        (t: any) => !(t.user_id === u.id && t.type === type),
      );
      d.auth_tokens.push(item);
    });
    const link = `${process.env.APP_ORIGIN || opts.origins[0]}/${type === "reset" ? "reset-password" : "verify-email"}?token=${raw}`;
    await sendEmail(
      u.email,
      type === "reset"
        ? "Reset your ZetaInstall password"
        : "Verify your ZetaInstall email",
      `Open this link within 30 minutes: ${link}\nIf you did not request this, ignore this email.`,
    );
  }
  app.get("/v1/health", async (_req, reply) => {
    if (!store.ready)
      return reply
        .code(503)
        .send({ api: "unavailable", storage: "recovery_required" });
    return {
      api: "online",
      worker: Date.now() - workerSeen < 15000 ? "online" : "offline",
      storage: "persistent",
      installers_enabled: process.env.ENABLE_INSTALLERS === "true",
      email: !!emailConfigured(),
      versions: { panel: "1.15.2", wings: "1.13.4" },
    };
  });
  app.get("/v1/workspace", async (req) => {
    const health = {
      api: "online",
      worker: Date.now() - workerSeen < 15000 ? "online" : "offline",
      storage: "persistent",
      installers_enabled: process.env.ENABLE_INSTALLERS === "true",
      email: !!emailConfigured(),
      versions: { panel: "1.15.2", wings: "1.13.4" },
    };
    if (!store.ready) throw fail(503, "Storage requires recovery");
    let current;
    try {
      current = session(req);
    } catch (e: any) {
      if (e.statusCode !== 401) throw e;
    }
    if (!current)
      return {
        user: null,
        csrf: null,
        health,
        servers: [],
        keys: [],
        nodes: [],
        domains: [],
        jobs: [],
        activity: [],
      };
    const { u, s } = current,
      d = store.snapshot();
    const servers = d.servers
      .filter((x: any) => x.user_id === u.id)
      .map(({ credential, ...x }: any) => x);
    return {
      user: safeUser(u),
      csrf: s.csrf,
      health,
      servers,
      keys: d.ssh_keys
        .filter((x: any) => x.user_id === u.id)
        .map(({ secret, ...x }: any) => ({
          ...x,
          in_use: servers.filter((server: any) => server.key_id === x.id)
            .length,
        })),
      nodes: d.nodes.filter((x: any) => x.user_id === u.id),
      domains: d.domains.filter((x: any) => x.user_id === u.id),
      jobs: d.jobs
        .filter((x: any) => x.user_id === u.id)
        .map(({ config_secret, ...x }: any) => x)
        .reverse(),
      activity: d.activity_logs
        .filter((x: any) => x.user_id === u.id)
        .slice(-200)
        .reverse(),
    };
  });
  app.get("/v1/session", async (req) => {
    try {
      const { u, s } = session(req);
      return { user: safeUser(u), csrf: s.csrf };
    } catch {
      return { user: null, csrf: null };
    }
  });
  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (
        store
          .snapshot()
          .settings.find((x: any) => x.key === "registration_enabled")
          ?.value === false
      )
        throw fail(
          503,
          "New account registration is currently disabled by the operator",
        );
      const p = creds.parse(req.body);
      const password_hash = await argon2.hash(p.password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      const u = await store.transaction((d) => {
        if (d.users.some((x: any) => x.email === p.email))
          throw fail(
            409,
            "Unable to register with this email. Try signing in or resetting your password.",
          );
        const id = crypto.randomUUID();
        const u = {
          id,
          user_id: id,
          created_at: now(),
          email: p.email,
          name: p.name || p.email.split("@")[0],
          password_hash,
          role: "user",
          status: "active",
        };
        d.users.push(u);
        audit(d, id, "account.created");
        return u;
      });
      reply.code(201);
      return startSession(u, reply);
    },
  );
  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().max(128),
        })
        .parse(req.body);
      const u = store.snapshot().users.find((x: any) => x.email === p.email);
      const valid = u
        ? await argon2.verify(u.password_hash, p.password)
        : await argon2.verify(dummyHash, p.password);
      if (!valid || !u || u.status === "suspended")
        throw fail(401, "Email or password is incorrect");
      return startSession(u, reply);
    },
  );
  app.post("/v1/auth/logout", async (req, reply) => {
    const { u, s } = session(req);
    await store.transaction((d) => {
      d.sessions = d.sessions.filter((x: any) => x.id !== s.id);
      audit(d, u.id, "auth.logout");
    });
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });
  app.post(
    "/v1/auth/forgot-password",
    { config: { rateLimit: { max: 4, timeWindow: "5 minutes" } } },
    async (req) => {
      const p = z
        .object({ email: z.email().transform((s) => s.toLowerCase()) })
        .parse(req.body);
      if (!emailConfigured())
        throw fail(
          503,
          "Password recovery requires SMTP configuration on the backend.",
        );
      const u = store.snapshot().users.find((u: any) => u.email === p.email);
      if (u) await emailToken(u, "reset");
      return { message: "If the account exists, a reset link has been sent." };
    },
  );
  app.post(
    "/v1/auth/reset-password",
    { config: { rateLimit: { max: 8, timeWindow: "5 minutes" } } },
    async (req) => {
      const p = z
        .object({
          token: z.string().max(100),
          password: z.string().min(12).max(128),
        })
        .parse(req.body);
      const ph = await argon2.hash(p.password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
      });
      await store.transaction((d) => {
        const t = d.auth_tokens.find(
          (t: any) =>
            t.token_hash === hash(p.token) &&
            t.type === "reset" &&
            Date.parse(t.expires_at) > Date.now(),
        );
        if (!t) throw fail(400, "Reset link is invalid or expired");
        const u = d.users.find((u: any) => u.id === t.user_id);
        u.password_hash = ph;
        d.auth_tokens = d.auth_tokens.filter((x: any) => x.user_id !== u.id);
        d.sessions = d.sessions.filter((s: any) => s.user_id !== u.id);
        audit(d, u.id, "password.reset");
      });
      return { ok: true };
    },
  );
  app.post("/v1/auth/send-verification", async (req) => {
    const { u } = session(req);
    await emailToken(u, "verify");
    return { message: "Verification email sent" };
  });
  app.post("/v1/auth/verify-email", async (req) => {
    const p = z.object({ token: z.string().max(100) }).parse(req.body);
    await store.transaction((d) => {
      const t = d.auth_tokens.find(
        (t: any) =>
          t.token_hash === hash(p.token) &&
          t.type === "verify" &&
          Date.parse(t.expires_at) > Date.now(),
      );
      if (!t) throw fail(400, "Verification link expired");
      d.users.find((u: any) => u.id === t.user_id).verified_at = now();
      d.auth_tokens = d.auth_tokens.filter((x: any) => x.id !== t.id);
    });
    return { ok: true };
  });
  app.patch("/v1/me", async (req) => {
    const { u } = session(req);
    const p = z
      .object({ name: z.string().trim().min(2).max(70) })
      .strict()
      .parse(req.body);
    return store.transaction((d) => {
      const current = owned(d, "users", u.id, u.id);
      current.name = p.name;
      audit(d, u.id, "profile.updated");
      return safeUser(current);
    });
  });
  app.post("/v1/me/password", async (req) => {
    const p = z
      .object({
        password: z.string().max(128),
        new_password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const u = await passwordCheck(req, p.password);
    const ph = await argon2.hash(p.new_password, { type: argon2.argon2id });
    await store.transaction((d) => {
      owned(d, "users", u.id, u.id).password_hash = ph;
      d.sessions = d.sessions.filter((s: any) => s.user_id !== u.id);
      audit(d, u.id, "password.changed");
    });
    return { message: "Password changed. Sign in again." };
  });
  app.get("/v1/sessions", async (req) => {
    const { u, s } = session(req);
    return store
      .snapshot()
      .sessions.filter((x: any) => x.user_id === u.id)
      .map((x: any) => ({
        id: x.id,
        created_at: x.created_at,
        last_seen_at: x.last_seen_at,
        current: x.id === s.id,
      }));
  });
  app.delete("/v1/sessions/:id", async (req) => {
    const { u } = session(req),
      id = (req.params as any).id;
    await store.transaction((d) => {
      owned(d, "sessions", id, u.id);
      d.sessions = d.sessions.filter((x: any) => x.id !== id);
      audit(d, u.id, "session.revoked");
    });
    return { ok: true };
  });
  app.delete("/v1/me", async (req, reply) => {
    const p = reauth.parse(req.body),
      u = await passwordCheck(req, p.password);
    await store.transaction((d) => {
      if (
        d.jobs.some(
          (j: any) => j.user_id === u.id && !terminal.includes(j.status),
        )
      )
        throw fail(
          409,
          "Wait for active jobs to finish before deleting your account",
        );
      for (const key of Object.keys(d))
        if (Array.isArray(d[key]))
          d[key] = d[key].filter((x: any) => x.user_id !== u.id);
    });
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });
  app.get("/v1/overview", async (req) => {
    const { u } = session(req);
    const d = store.snapshot();
    return {
      servers: d.servers.filter((x: any) => x.user_id === u.id).length,
      keys: d.ssh_keys.filter((x: any) => x.user_id === u.id).length,
      nodes: d.nodes.filter((x: any) => x.user_id === u.id).length,
      jobs: d.jobs.filter((x: any) => x.user_id === u.id),
      activity: d.activity_logs
        .filter((x: any) => x.user_id === u.id)
        .slice(-12)
        .reverse(),
    };
  });
  app.get("/v1/keys", async (req) => {
    const { u } = session(req);
    const d = store.snapshot();
    return d.ssh_keys
      .filter((k: any) => k.user_id === u.id)
      .map(({ secret, ...k }: any) => ({
        ...k,
        in_use: d.servers.filter(
          (s: any) => s.user_id === u.id && s.key_id === k.id,
        ).length,
      }));
  });
  app.post(
    "/v1/keys",
    { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { u } = session(req);
      const p = z
        .object({
          name: z.string().trim().min(2).max(70),
          algorithm: z.enum(["ed25519", "rsa"]),
          description: z.string().max(500).default(""),
          passphrase: z.string().max(128).optional(),
          consent: z.literal(true),
        })
        .strict()
        .parse(req.body);
      const pair = await generateSSHKey(p.algorithm, p.passphrase);
      const pub = pair.public;
      const fp = fingerprint(Buffer.from(pub.split(" ")[1], "base64"));
      const key = row(u.id, {
        name: p.name,
        description: p.description,
        algorithm: p.algorithm,
        public_key: pub,
        fingerprint: fp,
        secret: vault.seal(pair.private, u.id, "ssh-private"),
      });
      await store.transaction((d) => {
        d.ssh_keys.push(key);
        audit(d, u.id, "ssh_key.generated", key.id);
      });
      reply.code(201);
      const { secret, ...safe } = key;
      return { ...safe, private_key: pair.private };
    },
  );
  app.post(
    "/v1/keys/:id/export",
    { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } },
    async (req) => {
      const { password } = reauth.parse(req.body),
        u = await passwordCheck(req, password),
        k = owned(store.snapshot(), "ssh_keys", (req.params as any).id, u.id);
      await store.transaction((d) => audit(d, u.id, "ssh_key.exported", k.id));
      return { name: k.name, private_key: vault.open(k.secret, u.id) };
    },
  );
  app.delete("/v1/keys/:id", async (req) => {
    const { u } = session(req),
      id = (req.params as any).id;
    await store.transaction((d) => {
      owned(d, "ssh_keys", id, u.id);
      if (d.servers.some((s: any) => s.key_id === id && s.user_id === u.id))
        throw fail(
          409,
          "This key is used by a server. Remove or change that connection first.",
        );
      d.ssh_keys = d.ssh_keys.filter((x: any) => x.id !== id);
      audit(d, u.id, "ssh_key.deleted", id);
    });
    return { ok: true };
  });
  app.post(
    "/v1/connections/scan",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req) => {
      const { u } = session(req),
        p = z
          .object({
            host: z.string().max(253),
            port: z.number().int().min(1).max(65535),
          })
          .parse(req.body);
      let result;
      try {
        result = await scanHost(p.host, p.port);
      } catch (e: any) {
        throw fail(422, e.message);
      }
      const probe = row(u.id, {
        host: p.host,
        port: p.port,
        ...result,
        expires_at: Date.now() + 600000,
      });
      await store.transaction((d) => {
        d.probes = d.probes.filter((x: any) => x.expires_at > Date.now());
        d.probes.push(probe);
      });
      return probe;
    },
  );
  app.post(
    "/v1/connections/test",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req) => {
      const { u } = session(req);
      const p = z
        .object({
          server: serverSchema,
          probe_id: z.string(),
          trust: z.literal(true),
        })
        .parse(req.body);
      const probe = owned(store.snapshot(), "probes", p.probe_id, u.id);
      if (
        probe.expires_at < Date.now() ||
        probe.host !== p.server.host ||
        probe.port !== p.server.port ||
        probe.fingerprint !== p.server.fingerprint
      )
        throw fail(
          409,
          "Fingerprint challenge expired or connection details changed. Scan again.",
        );
      let credential: any = { password: p.server.password };
      if (p.server.auth === "key") {
        const k = owned(
          store.snapshot(),
          "ssh_keys",
          p.server.key_id || "",
          u.id,
        );
        credential = {
          private_key: vault.open(k.secret, u.id),
          passphrase: p.server.passphrase,
        };
      }
      const server = { ...p.server, ip: probe.ip };
      let evidence;
      try {
        const ssh = await connect(server, credential);
        try {
          evidence = await remote(
            ssh,
            "probe",
            {},
            undefined,
            server.username === "root",
          );
        } finally {
          ssh.end();
        }
      } catch (e: any) {
        throw fail(422, e.message);
      }
      const test = row(u.id, {
        host: server.host,
        port: server.port,
        fingerprint: server.fingerprint,
        server_digest: hash(JSON.stringify(p.server)),
        evidence,
        expires_at: Date.now() + 600000,
      });
      await store.transaction((d) => d.probes.push(test));
      return { test_id: test.id, evidence };
    },
  );
  app.get("/v1/servers", async (req) => {
    const { u } = session(req);
    return store
      .snapshot()
      .servers.filter((s: any) => s.user_id === u.id)
      .map(({ credential, ...s }: any) => s);
  });
  app.post("/v1/servers", async (req, reply) => {
    const { u } = session(req);
    const p = z
      .object({ server: serverSchema, test_id: z.string() })
      .parse(req.body);
    const test = owned(store.snapshot(), "probes", p.test_id, u.id);
    if (
      test.expires_at < Date.now() ||
      test.server_digest !== hash(JSON.stringify(p.server))
    )
      throw fail(
        409,
        "A successful connection test for these exact settings is required.",
      );
    const ip = await destination(p.server.host);
    const probe = store
      .snapshot()
      .probes.find(
        (x: any) =>
          x.user_id === u.id &&
          x.host === p.server.host &&
          x.fingerprint === p.server.fingerprint &&
          x.ip === ip,
      );
    if (!probe) throw fail(409, "Network address changed. Scan again.");
    const { password, passphrase, ...safe } = p.server;
    const server = row(u.id, {
      ...safe,
      ip,
      evidence: test.evidence,
      status: "verified",
      last_verified_at: now(),
      credential: vault.seal(
        JSON.stringify({ password, passphrase }),
        u.id,
        "connection",
      ),
    });
    await store.transaction((d) => {
      if (
        d.servers.some(
          (s: any) =>
            s.user_id === u.id && s.ip === ip && s.port === server.port,
        )
      )
        throw fail(409, "This SSH endpoint is already in your workspace");
      d.servers.push(server);
      audit(d, u.id, "server.added", server.id);
    });
    reply.code(201);
    const { credential, ...publicServer } = server;
    return publicServer;
  });
  app.patch("/v1/servers/:id", async (req) => {
    const { u } = session(req);
    const p = z
      .object({
        name: z.string().trim().min(2).max(70),
        description: z.string().max(500).optional(),
      })
      .strict()
      .parse(req.body);
    return store.transaction((d) => {
      const s = owned(d, "servers", (req.params as any).id, u.id);
      Object.assign(s, p);
      audit(d, u.id, "server.updated", s.id);
      const { credential, ...safe } = s;
      return safe;
    });
  });
  app.delete("/v1/servers/:id", async (req) => {
    const { u } = session(req),
      id = (req.params as any).id;
    await store.transaction((d) => {
      owned(d, "servers", id, u.id);
      if (
        d.jobs.some(
          (j: any) => j.server_id === id && !terminal.includes(j.status),
        )
      )
        throw fail(409, "Wait for the active job before removing this server");
      if (d.nodes.some((n: any) => n.server_id === id))
        throw fail(409, "Disconnect this server’s nodes first");
      d.servers = d.servers.filter((s: any) => s.id !== id);
      audit(d, u.id, "server.removed", id);
    });
    return {
      message:
        "Removed from ZetaInstall. The VPS and installed services are unchanged.",
    };
  });
  app.get("/v1/nodes", async (req) => {
    const { u } = session(req);
    return store.snapshot().nodes.filter((x: any) => x.user_id === u.id);
  });
  app.post("/v1/nodes", async (req, reply) => {
    const { u } = session(req);
    const p = z
      .object({
        name: z.string().min(2).max(70),
        server_id: z.string(),
        node_id: z.number().int().positive(),
        panel_url: z.url().max(253),
        fqdn: domainSchema,
        daemon_port: z.number().int().min(1).max(65535),
        sftp_port: z.number().int().min(1).max(65535),
      })
      .strict()
      .parse(req.body);
    const url = new URL(p.panel_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw fail(
        400,
        "Use an HTTPS Panel origin without a path, query or credentials",
      );
    await destination(url.hostname);
    const n = await store.transaction((d) => {
      owned(d, "servers", p.server_id, u.id);
      if (
        d.nodes.some(
          (n: any) =>
            n.user_id === u.id &&
            n.panel_url === p.panel_url &&
            n.node_id === p.node_id,
        )
      )
        throw fail(409, "This node is already connected");
      const n = row(u.id, {
        ...p,
        status: "unverified",
        last_verified_at: null,
      });
      d.nodes.push(n);
      audit(d, u.id, "node.connected", n.id);
      return n;
    });
    reply.code(201);
    return n;
  });
  app.delete("/v1/nodes/:id", async (req) => {
    const { u } = session(req),
      id = (req.params as any).id;
    await store.transaction((d) => {
      owned(d, "nodes", id, u.id);
      d.nodes = d.nodes.filter((n: any) => n.id !== id);
      audit(d, u.id, "node.disconnected", id);
    });
    return { ok: true };
  });
  app.get("/v1/domains", async (req) => {
    const { u } = session(req);
    return store.snapshot().domains.filter((x: any) => x.user_id === u.id);
  });
  app.post("/v1/domains", async (req, reply) => {
    const { u } = session(req),
      p = z
        .object({ fqdn: domainSchema, server_id: z.string() })
        .parse(req.body);
    const addresses = await lookup(p.fqdn, { all: true }).catch(() => []);
    const domain = await store.transaction((d) => {
      const s = owned(d, "servers", p.server_id, u.id);
      if (d.domains.some((x: any) => x.user_id === u.id && x.fqdn === p.fqdn))
        throw fail(409, "Domain already added");
      const item = row(u.id, {
        ...p,
        addresses: addresses.map((a) => a.address),
        dns_status:
          addresses.length && addresses.every((a) => a.address === s.ip)
            ? "verified"
            : "mismatch",
        last_verified_at: now(),
      });
      d.domains.push(item);
      audit(d, u.id, "domain.added", item.id);
      return item;
    });
    reply.code(201);
    return domain;
  });
  app.post("/v1/domains/:id/verify", async (req) => {
    const { u } = session(req),
      domain = owned(store.snapshot(), "domains", (req.params as any).id, u.id);
    const ip = await destination(domain.fqdn);
    const certificate = await new Promise<any>((resolve, reject) => {
      const socket = tls.connect(
        {
          host: ip,
          port: 443,
          servername: domain.fqdn,
          rejectUnauthorized: true,
        },
        () => {
          const c = socket.getPeerCertificate();
          resolve({
            issuer: c.issuer?.O,
            valid_to: c.valid_to,
            subject: c.subject?.CN,
            fingerprint: c.fingerprint256,
            authorized: socket.authorized,
          });
          socket.end();
        },
      );
      socket.setTimeout(10000, () =>
        socket.destroy(new Error("TLS timed out")),
      );
      socket.once("error", () =>
        reject(
          fail(
            422,
            "Certificate verification failed. Check DNS, port 443, certificate hostname, expiry and trust chain.",
          ),
        ),
      );
    });
    await store.transaction((d) => {
      const s = owned(d, "servers", domain.server_id, u.id);
      Object.assign(owned(d, "domains", domain.id, u.id), {
        dns_status: ip === s.ip ? "verified" : "mismatch",
        certificate,
        last_verified_at: now(),
      });
      audit(d, u.id, "tls.verified", domain.id);
    });
    return certificate;
  });
  app.delete("/v1/domains/:id", async (req) => {
    const { u } = session(req),
      id = (req.params as any).id;
    await store.transaction((d) => {
      owned(d, "domains", id, u.id);
      d.domains = d.domains.filter((x: any) => x.id !== id);
    });
    return { ok: true };
  });
  app.get("/v1/jobs", async (req) => {
    const { u } = session(req);
    return store
      .snapshot()
      .jobs.filter((x: any) => x.user_id === u.id)
      .map(({ config_secret, ...j }: any) => j)
      .reverse();
  });
  app.post("/v1/jobs", async (req, reply) => {
    const { u } = session(req);
    const p = z
      .object({
        server_id: z.string(),
        type: z.enum(jobTypes),
        config: z.record(z.string(), z.unknown()).default({}),
        confirmed: z.boolean().default(false),
        idempotency_key: z.string().min(16).max(100),
      })
      .strict()
      .parse(req.body);
    const mutating = !["diagnostics", "firewall_check", "ssl_check"].includes(
      p.type,
    );
    if (mutating && process.env.ENABLE_INSTALLERS !== "true")
      throw fail(
        422,
        "Remote changes are disabled until staging validation is complete. Set ENABLE_INSTALLERS=true on a validated persistent backend. Diagnostics remain available.",
      );
    if (mutating && !p.confirmed)
      throw fail(400, "Review and explicitly approve the remote changes");
    const config = validateJobConfig(p.type, p.config);
    const digest = hash(
      JSON.stringify({ server_id: p.server_id, type: p.type, config }),
    );
    const job = await store.transaction((d) => {
      if (
        d.settings.some((x: any) => x.key === "maintenance" && x.value === true)
      )
        throw fail(503, "New jobs are paused for maintenance");
      const s = owned(d, "servers", p.server_id, u.id);
      if (s.recovery_required && mutating)
        throw fail(
          409,
          "This server requires diagnostics after an interrupted job before further remote changes",
        );
      if (
        "os_profile" in config &&
        config.os_profile !== detectedProfile(s.evidence)
      )
        throw fail(
          422,
          "Installation profile does not match the verified VPS operating system. Test the SSH connection again and select the matching Ubuntu profile.",
        );
      if (p.type === "upcloud_setup" && s.provider !== "UpCloud")
        throw fail(
          400,
          "UpCloud Special Setup is restricted to UpCloud servers",
        );
      const prior = d.jobs.find(
        (j: any) =>
          j.user_id === u.id && j.idempotency_key === p.idempotency_key,
      );
      if (prior) {
        if (prior.request_digest !== digest)
          throw fail(409, "Idempotency key reused with different settings");
        const { config_secret, ...safe } = prior;
        return safe;
      }
      if (
        d.jobs.some(
          (j: any) => j.server_id === s.id && !terminal.includes(j.status),
        )
      )
        throw fail(409, "A job is already active for this server");
      const j = row(u.id, {
        server_id: s.id,
        server_name: s.name,
        type: p.type,
        status: "Pending",
        step: "Waiting for worker",
        progress: 0,
        logs: [],
        cancel_requested: false,
        idempotency_key: p.idempotency_key,
        request_digest: digest,
        config_secret: vault.seal(JSON.stringify(config), u.id, "job-config"),
        lease_epoch: 0,
        config_expires_at: Date.now() + 3600000,
      });
      d.jobs.push(j);
      audit(d, u.id, "job.created", j.id);
      const { config_secret, ...safe } = j;
      return safe;
    });
    reply.code(202);
    return job;
  });
  app.get("/v1/jobs/:id/events", async (req, reply) => {
    const { u } = session(req);
    const id = (req.params as any).id;
    owned(store.snapshot(), "jobs", id, u.id);
    const origin = req.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      ...(origin && opts.origins.includes(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
          }
        : {}),
    });
    let sequence = 0,
      previous = "";
    const push = () => {
      try {
        session(req);
        const { config_secret, ...job } = owned(
          store.snapshot(),
          "jobs",
          id,
          u.id,
        );
        const value = JSON.stringify(job);
        if (value !== previous) {
          previous = value;
          reply.raw.write(
            `id: ${++sequence}\nevent: progress\ndata: ${value}\n\n`,
          );
        } else reply.raw.write(": heartbeat\n\n");
        if (terminal.includes(job.status)) {
          clearInterval(timer);
          reply.raw.end();
        }
      } catch {
        clearInterval(timer);
        reply.raw.end();
      }
    };
    const timer = setInterval(push, 2000);
    reply.raw.on("close", () => clearInterval(timer));
    push();
  });
  app.post("/v1/jobs/:id/cancel", async (req) => {
    const { u } = session(req);
    return store.transaction((d) => {
      const j = owned(d, "jobs", (req.params as any).id, u.id);
      if (terminal.includes(j.status)) throw fail(409, "Job already finished");
      j.cancel_requested = true;
      if (j.status === "Pending") {
        j.status = "Cancelled";
        j.completed_at = now();
        delete j.config_secret;
      }
      audit(d, u.id, "job.cancel_requested", j.id);
      return {
        message:
          j.status === "Cancelled"
            ? "Job cancelled"
            : "Cancellation requested. The worker will stop at a safe boundary.",
      };
    });
  });
  app.get("/v1/activity", async (req) => {
    const { u } = session(req);
    return store
      .snapshot()
      .activity_logs.filter((x: any) => x.user_id === u.id)
      .slice(-200)
      .reverse();
  });
  app.get("/v1/admin", async (req) => {
    const { u } = session(req);
    if (u.role !== "administrator")
      throw fail(403, "Administrator access required");
    const d = store.snapshot();
    return {
      users: d.users.map(safeUser),
      jobs: d.jobs.map(({ config_secret, logs, ...j }: any) => j),
      worker: Date.now() - workerSeen < 15000 ? "online" : "offline",
      revision: d.revision,
      settings: {
        maintenance:
          d.settings.find((x: any) => x.key === "maintenance")?.value || false,
        registration_enabled:
          d.settings.find((x: any) => x.key === "registration_enabled")
            ?.value !== false,
      },
    };
  });

  app.patch("/v1/admin/settings", async (req) => {
    const { u } = session(req);
    if (u.role !== "administrator")
      throw fail(403, "Administrator access required");
    const p = z
      .object({ maintenance: z.boolean(), registration_enabled: z.boolean() })
      .strict()
      .parse(req.body);
    await store.transaction((d) => {
      for (const [key, value] of Object.entries(p)) {
        const existing = d.settings.find((x: any) => x.key === key);
        if (existing) existing.value = value;
        else d.settings.push(row("system", { key, value, scope: "global" }));
      }
      audit(d, u.id, "admin.settings_updated");
    });
    return p;
  });
  app.post("/v1/jobs/:id/retry", async (req) => {
    const { u } = session(req);
    const id = (req.params as any).id;
    return store.transaction((d) => {
      if (
        d.settings.some((x: any) => x.key === "maintenance" && x.value === true)
      )
        throw fail(503, "New jobs are paused for maintenance");
      const previous = owned(d, "jobs", id, u.id);
      if (!terminal.includes(previous.status))
        throw fail(409, "Job is still active");
      if (
        !["diagnostics", "firewall_check", "ssl_check"].includes(previous.type)
      )
        throw fail(
          409,
          "Remote changes require a fresh review. Run diagnostics before creating a new installation.",
        );
      owned(d, "servers", previous.server_id, u.id);
      if (
        d.jobs.some(
          (j: any) =>
            j.server_id === previous.server_id && !terminal.includes(j.status),
        )
      )
        throw fail(409, "A job is already active");
      const j = row(u.id, {
        server_id: previous.server_id,
        server_name: previous.server_name,
        type: previous.type,
        status: "Pending",
        step: "Safe diagnostic retry queued",
        progress: 0,
        logs: [],
        cancel_requested: false,
        retry_of: id,
        config_secret: vault.seal("{}", u.id, "job-config"),
        config_expires_at: Date.now() + 3600000,
        lease_epoch: 0,
      });
      d.jobs.push(j);
      audit(d, u.id, "job.retry_queued", j.id);
      const { config_secret, ...safe } = j;
      return safe;
    });
  });
  app.patch("/v1/admin/users/:id", async (req) => {
    const { u } = session(req);
    if (u.role !== "administrator")
      throw fail(403, "Administrator access required");
    const p = z
      .object({ status: z.enum(["active", "suspended"]) })
      .strict()
      .parse(req.body);
    const id = (req.params as any).id;
    if (id === u.id)
      throw fail(400, "You cannot suspend your own administrator account");
    return store.transaction((d) => {
      const target = d.users.find((x: any) => x.id === id);
      if (!target) throw fail(404, "User not found");
      target.status = p.status;
      if (p.status === "suspended") {
        d.sessions = d.sessions.filter((x: any) => x.user_id !== id);
        for (const job of d.jobs.filter(
          (j: any) => j.user_id === id && !terminal.includes(j.status),
        )) {
          job.cancel_requested = true;
          if (job.status === "Pending") {
            job.status = "Cancelled";
            job.completed_at = now();
            delete job.config_secret;
          }
        }
      }
      audit(d, u.id, "admin.account_" + p.status, id);
      return safeUser(target);
    });
  });
  app.get("/v1/admin/logs", async (req) => {
    const { u } = session(req);
    if (u.role !== "administrator")
      throw fail(403, "Administrator access required");
    return store.snapshot().activity_logs.slice(-200).reverse();
  });
  const dummyHash = await argon2.hash(token(), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });
  let workerSeen = 0;
  const internal = Fastify({ logger: false, bodyLimit: 65536 });
  internal.addHook("onRequest", async (req) => {
    if (
      !equal(
        String(req.headers.authorization || ""),
        `Bearer ${opts.workerToken}`,
      )
    )
      throw fail(401, "Unauthorized worker");
  });
  internal.setErrorHandler((e: any, req, reply) =>
    reply
      .code(e.statusCode || 500)
      .send({ error: e.statusCode ? e.message : "Internal operation failed" }),
  );
  internal.post("/claim", async () => {
    workerSeen = Date.now();
    const data = store.snapshot();
    const existing = data.jobs.find(
      (j: any) => !terminal.includes(j.status) && j.status !== "Pending",
    );
    if (existing && Date.parse(existing.lease_until) < Date.now()) {
      await store.transaction((d) => {
        const j = d.jobs.find((x: any) => x.id === existing.id);
        j.status = "Failed";
        j.step = "Recovery required: worker disconnected";
        j.error =
          "Remote state is uncertain. Run diagnostics before creating a new installation.";
        j.completed_at = now();
        const s = d.servers.find((x: any) => x.id === j.server_id);
        if (s) s.recovery_required = true;
        delete j.config_secret;
      });
      return null;
    }
    if (existing) return null;
    return store.transaction((d) => {
      const j = d.jobs.find((j: any) => j.status === "Pending");
      if (!j) return null;
      if (!j.config_secret || j.config_expires_at < Date.now()) {
        j.status = "Failed";
        j.error =
          "Job credential grant expired or was removed during recovery. Submit a newly approved job.";
        j.completed_at = now();
        delete j.config_secret;
        return null;
      }
      if (
        !d.users.some((u: any) => u.id === j.user_id && u.status === "active")
      ) {
        j.status = "Cancelled";
        j.completed_at = now();
        delete j.config_secret;
        return null;
      }
      const s = owned(d, "servers", j.server_id, j.user_id);
      const extra = JSON.parse(vault.open(s.credential, j.user_id));
      let credential = extra;
      if (s.auth === "key") {
        const k = owned(d, "ssh_keys", s.key_id, j.user_id);
        credential = { ...extra, private_key: vault.open(k.secret, j.user_id) };
      }
      j.status = "Connecting";
      j.started_at = now();
      j.lease_epoch++;
      j.lease_until = new Date(Date.now() + 45000).toISOString();
      return {
        id: j.id,
        type: j.type,
        epoch: j.lease_epoch,
        server: s,
        credential,
        config: JSON.parse(vault.open(j.config_secret, j.user_id)),
      };
    });
  });
  internal.post("/heartbeat", async (req) => {
    workerSeen = Date.now();
    const p = z
      .object({ id: z.string().optional(), epoch: z.number().optional() })
      .parse(req.body);
    if (!p.id) return { ok: true };
    return store.transaction((d) => {
      const j = d.jobs.find((x: any) => x.id === p.id);
      if (!j || j.lease_epoch !== p.epoch || terminal.includes(j.status))
        throw fail(409, "Lease expired");
      j.lease_until = new Date(Date.now() + 45000).toISOString();
      return { cancel_requested: j.cancel_requested };
    });
  });
  internal.post("/update", async (req) => {
    const p = z
      .object({
        id: z.string(),
        epoch: z.number(),
        status: z.enum([
          "Preparing",
          "Installing",
          "Configuring",
          "Verifying",
          "Completed",
          "Failed",
          "Cancelled",
        ]),
        step: z.string().max(150),
        progress: z.number().min(0).max(100),
        result: z.unknown().optional(),
        error: z.string().max(500).optional(),
      })
      .strict()
      .parse(req.body);
    return store.transaction((d) => {
      const j = d.jobs.find((x: any) => x.id === p.id);
      if (!j || j.lease_epoch !== p.epoch || terminal.includes(j.status))
        throw fail(409, "Lease expired");
      j.status = p.status;
      j.step = p.step;
      j.progress = p.progress;
      j.logs.push({ at: now(), message: p.step });
      if (j.logs.length > 200) j.logs.shift();
      if (p.error) j.error = p.error;
      if (p.result) {
        j.result = p.result;
        const s = d.servers.find((x: any) => x.id === j.server_id);
        if (s) {
          s.last_verified_at = now();
          s.latest_diagnostics = p.result;
          if (j.type === "diagnostics" && p.status === "Completed")
            s.recovery_required = false;
        }
      }
      if (terminal.includes(p.status)) {
        j.completed_at = now();
        delete j.config_secret;
        audit(d, j.user_id, "job." + p.status.toLowerCase(), j.id);
        d.installations.push(
          row(j.user_id, {
            job_id: j.id,
            server_id: j.server_id,
            type: j.type,
            status: j.status,
          }),
        );
      }
      return { ok: true, cancel_requested: j.cancel_requested };
    });
  });
  return { app, internal };
}
export function validateJobConfig(type: string, input: any) {
  if (type === "install_panel")
    return z
      .object({
        os_profile: z.enum(installationProfiles).default("ubuntu-24.04"),
        domain: domainSchema,
        email: z.email().max(254),
        admin_name: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/),
        admin_password: z.string().min(12).max(128),
        ssl: z.literal(true),
        consent: z.literal(true),
      })
      .strict()
      .parse(input);
  if (["install_wings", "configure_wings", "upcloud_setup"].includes(type))
    return z
      .object({
        os_profile: z.enum(installationProfiles).default("ubuntu-24.04"),
        domain: domainSchema,
        panel_url: z
          .url()
          .max(253)
          .refine((s) => {
            const u = new URL(s);
            return (
              u.protocol === "https:" &&
              !u.username &&
              !u.password &&
              u.pathname === "/" &&
              !u.search &&
              !u.hash
            );
          }),
        node_id: z.number().int().positive(),
        email: z.email().max(254),
        yaml: z.string().min(30).max(32768),
        proxy: z.boolean().default(false),
        consent: z.literal(true),
      })
      .strict()
      .parse(input);
  if (type === "certificate_issue" || type === "certificate_renew")
    return z
      .object({
        domain: domainSchema,
        email: z.email().max(254),
        consent: z.literal(true),
      })
      .strict()
      .parse(input);
  if (type === "repair_service")
    return z
      .object({
        service: z.enum([
          "nginx",
          "php8.3-fpm",
          "mariadb",
          "redis-server",
          "wings",
          "pteroq",
        ]),
        operation: z.enum(["start", "restart"]),
        consent: z.literal(true),
      })
      .strict()
      .parse(input);
  if (type === "key_install")
    return z
      .object({
        public_key: z
          .string()
          .max(2000)
          .regex(/^(ssh-ed25519|ssh-rsa) [A-Za-z0-9+/=]+(?: [^\r\n]*)?$/),
        consent: z.literal(true),
      })
      .strict()
      .parse(input);
  return z.object({}).strict().parse(input);
}
