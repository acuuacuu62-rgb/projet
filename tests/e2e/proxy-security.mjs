import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.E2E_BASE_URL || "http://localhost:3000",
  email = `proxy-${randomUUID()}@example.test`,
  password = `Synthetic-${randomUUID()}!`;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
  throw new Error("Proxy security test requires a local synthetic environment");
const req = (path, opts = {}) => fetch(origin + "/api" + path, opts);
const json = { "Content-Type": "application/json", Origin: origin };
const r = await req("/auth/register", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ email, password, name: "Proxy Test" }),
});
assert.equal(r.status, 201);
const body = await r.json(),
  cookies = r.headers.getSetCookie();
const cookie = cookies.find((x) => x.startsWith("__Host-zeta_session="));
assert(cookie);
assert(!/;\s*Domain=/i.test(cookie));
for (const attr of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"])
  assert(cookie.includes(attr));
const pair = cookie.split(";")[0];
try {
  const ws = await req("/workspace", { headers: { cookie: pair } });
  assert.equal(ws.status, 200);
  assert.equal((await ws.json()).user.id, body.user.id);
  const badcsrf = await req("/connections/scan", {
    method: "POST",
    headers: { ...json, cookie: pair, "X-CSRF-Token": "bad" },
    body: JSON.stringify({ host: "127.0.0.1", port: 22 }),
  });
  assert.equal(badcsrf.status, 403);
  const badorigin = await req("/connections/scan", {
    method: "POST",
    headers: {
      ...json,
      Origin: "https://evil.example",
      cookie: pair,
      "X-CSRF-Token": body.csrf,
    },
    body: JSON.stringify({ host: "127.0.0.1", port: 22 }),
  });
  assert.equal(badorigin.status, 403);
  const anon = await req("/connections/scan", {
    method: "POST",
    headers: { ...json, "X-CSRF-Token": body.csrf },
    body: JSON.stringify({ host: "127.0.0.1", port: 22 }),
  });
  assert.equal(anon.status, 401);
  console.log(
    "PASS: proxy preserves secure, host-only HttpOnly SameSite=Lax cookie; real session, CSRF, Origin and anonymous checks.",
  );
} finally {
  const del = await req("/me", {
    method: "DELETE",
    headers: { ...json, cookie: pair, "X-CSRF-Token": body.csrf },
    body: JSON.stringify({ password }),
  });
  assert.equal(del.status, 200);
}
