// Synthetic local account and mocked SSH scan; never contacts a real VPS.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const cli = async (...args) =>
  (
    await exec("coderabbit-agent-browser", args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
const ev = async (code) => JSON.parse(await cli("eval", code));
const wait = async (code, ms = 7000) => {
  for (let i = 0; i < ms / 100; i++) {
    if (await ev(code)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + code);
};
const button = async (label) =>
  cli("find", "role", "button", "click", "--name", label);
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("Session tests must target a local synthetic environment.");
const email = `session-${randomUUID()}@example.test`,
  password = `Synthetic-${randomUUID()}!`;
const guest = {
  user: null,
  csrf: null,
  health: null,
  servers: [],
  keys: [],
  nodes: [],
  domains: [],
  jobs: [],
  activity: [],
};
let created = false;
async function logout() {
  const ok = await ev(
    `(async()=>{let s=await(await fetch('/api/session')).json();if(!s.user)return true;return (await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:'{}'})).ok})()`,
  );
  assert(ok);
}
async function login() {
  await cli("fill", 'input[name="email"]', email);
  await cli("fill", 'input[name="password"]', password);
  await button("Sign in to ZetaInstall");
}
try {
  await cli("open", base + "/register");
  await cli("fill", 'input[name="name"]', "Session Test");
  await cli("fill", 'input[name="email"]', email);
  await cli("fill", 'input[name="password"]', password);
  await button("Create your workspace");
  await wait(
    `!!document.querySelector('a[aria-label="Open account settings"]')`,
  );
  created = true;
  await logout();
  await cli("open", base + "/login");
  await cli(
    "network",
    "route",
    "**/api/workspace",
    "--body",
    JSON.stringify(guest),
  );
  await login();
  await wait(
    `document.querySelector('[role="alert"]')?.textContent.includes('session could not be verified')===true`,
  );
  assert.equal(await ev(`location.pathname`), "/login");
  await cli("network", "unroute");
  await logout();
  await cli("open", base + "/login");
  await cli("network", "route", "**/api/workspace", "--abort");
  await login();
  await wait(
    `document.querySelector('[role="alert"]')?.textContent.includes('session could not be verified')===true`,
  );
  assert.equal(await ev(`location.pathname`), "/login");
  await cli("network", "unroute");
  await logout();
  await cli("open", base + "/login");
  await cli("network", "route", "**/api/auth/login", "--abort");
  await login();
  await wait(
    `document.querySelector('[role="alert"]')?.textContent.includes('Could not reach the API')===true`,
  );
  assert.equal(await ev(`location.pathname`), "/login");
  await cli("network", "unroute");
  await cli("open", base + "/servers/add");
  await wait(`!!document.querySelector('button[aria-label="Sign in"]')`);
  await cli("click", 'button[aria-label="Sign in"]');
  // Hold one anonymous workspace request, complete login in the modal, then release its stale result.
  await wait(
    `document.querySelector('[role="dialog"] input[name="email"]')!==null`,
  );
  await ev(
    `(() => { window.__originalFetch=window.fetch; window.__delayed=false; window.fetch=(input,init)=>{const url=typeof input==='string'?input:String(input.url ?? input);if(url.endsWith('/api/workspace')&&!window.__delayed){window.__delayed=true;return new Promise(resolve=>window.__release=()=>resolve(new Response(${JSON.stringify(JSON.stringify(guest))},{status:200,headers:{'Content-Type':'application/json'}})));}return window.__originalFetch(input,init);};return true; })()`,
  );
  await wait(`window.__delayed===true`, 9000);
  await cli("fill", '[role="dialog"] input[name="email"]', email);
  await cli("fill", '[role="dialog"] input[name="password"]', password);
  await button("Sign in to ZetaInstall");
  await wait(
    `!!document.querySelector('a[aria-label="Open account settings"]')`,
  );
  await ev(`(window.__release(),true)`);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    await ev(
      `!!document.querySelector('a[aria-label="Open account settings"]')`,
    ),
    true,
    "stale guest response must not clear authenticated user",
  );
  await ev(`(window.fetch=window.__originalFetch,true)`);
  await cli("open", base + "/servers/add");
  await wait(
    `!!document.querySelector('a[aria-label="Open account settings"]')`,
  );
  await cli("fill", 'input[name="name"]', "Synthetic VPS");
  await cli("fill", 'input[name="host"]', "127.0.0.1");
  await cli("select", 'select[name="auth"]', "password");
  await cli("fill", 'input[name="password"]', "synthetic-ssh-password");
  await button("Scan host identity");
  await wait(
    `document.querySelector('.inline-error')?.textContent.includes('Only public unicast') === true`,
  );
  assert.equal(
    await ev(`!!document.querySelector('[role="dialog"]')`),
    false,
    "real scan request reached SSRF policy with authenticated session",
  );
  await cli("fill", 'input[name="host"]', "8.8.8.8");
  await cli(
    "network",
    "route",
    "**/api/connections/scan",
    "--body",
    JSON.stringify({
      id: "synthetic-scan",
      fingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }),
  );
  await button("Scan host identity");
  await wait(`document.body.textContent.includes('Is this your server?')`);
  assert.equal(
    await ev(`!!document.querySelector('[role="dialog"]')`),
    false,
    "authenticated Add VPS must not request login",
  );
  await cli("network", "unroute");
  console.log(
    "PASS: verified login, missing/failed session, API network failure, stale response, authenticated SSRF rejection, and mocked SSH scan.",
  );
} finally {
  await cli("network", "unroute").catch(() => {});
  if (created) {
    const ok = await ev(
      `(async()=>{let s=await(await fetch('/api/session')).json();if(s.user?.email!==${JSON.stringify(email)})return false;return (await fetch('/api/me',{method:'DELETE',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({password:${JSON.stringify(password)}})})).ok})()`,
    ).catch(() => false);
    if (!ok) console.error("Synthetic local account cleanup not confirmed");
  }
}
