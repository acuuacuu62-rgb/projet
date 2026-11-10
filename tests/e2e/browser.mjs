// Runs against the Chromium session registered in CodeRabbit Preview.
// Synthetic local account only; no VPS or provider mutations.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const cli = async (...args) =>
  (
    await exec("coderabbit-agent-browser", args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
const evaluate = async (code) => JSON.parse(await cli("eval", code));
const waitFor = async (code) => {
  for (let i = 0; i < 50; i++) {
    if (await evaluate(code)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Browser condition timed out: " + code);
};
const ref = async (role, label) => {
  const text = await cli("snapshot", "-i");
  const line = text
    .split("\n")
    .find((l) => l.includes(`${role} "${label}"`) && l.includes("ref="));
  assert(line, `Missing ${role}: ${label}`);
  return "@" + line.match(/\bref=(e\d+)/)[1];
};
const click = async (label) => cli("click", await ref("button", label));
const email = `browser-${randomUUID()}@example.test`;
const password = `Synthetic-${randomUUID()}!`;
const scratch = await mkdtemp(join(tmpdir(), "zeta-browser-e2e-"));
let created = false;
try {
  await cli("set", "viewport", "1440", "1100");
  await cli("open", base + "/settings");
  const existing = await evaluate(
    `(async () => (await (await fetch('/api/session')).json()).user !== null)()`,
  );
  if (existing) {
    await waitFor(`document.querySelector('input[name="name"]') !== null`);
    await click("Sign out");
    await waitFor(
      `document.querySelector('a[aria-label="Open account settings"]') === null`,
    );
  }
  await cli("open", base + "/register");
  await cli("fill", 'input[name="name"]', "Browser E2E");
  await cli("fill", 'input[name="email"]', email);
  await cli("fill", 'input[name="password"]', password);
  await click("Create your workspace");
  await waitFor(
    `document.querySelector('a[aria-label="Open account settings"]') !== null`,
  );
  created = true;
  await cli("open", base + "/ssh-keys");
  await waitFor(
    `document.querySelector('a[aria-label="Open account settings"]') !== null`,
  );
  await click("Generate SSH key");
  await cli("fill", 'input[name="name"]', "Browser E2E key");
  await cli("check", 'input[name="consent"]');
  await click("Generate key");
  await waitFor(
    `document.querySelector('[role="dialog"]')?.textContent.includes('Your SSH key is ready') === true`,
  );
  const priv = join(scratch, "private"),
    pub = join(scratch, "public");
  await cli("download", await ref("button", "Private key"), priv);
  await cli("download", await ref("button", "Public key"), pub);
  await chmod(priv, 0o600);
  const derived = (await exec("ssh-keygen", ["-y", "-f", priv])).stdout
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
  assert.equal(
    derived,
    (await readFile(pub, "utf8")).trim().split(" ").slice(0, 2).join(" "),
  );
  await click("Close dialog");
  await cli("set", "viewport", "390", "844");
  await waitFor(
    `document.querySelector('#workspace-navigation')?.inert === true`,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  await click("Toggle navigation");
  await waitFor(
    `document.querySelector('#workspace-navigation').getBoundingClientRect().left === 0`,
  );
  await click("Close navigation");
  await waitFor(
    `document.querySelector('#workspace-navigation')?.inert === true`,
  );
  const axe = JSON.parse(await cli("a11y", "--json"));
  assert.equal(
    axe.data.counts.violations,
    0,
    "Key page accessibility violations",
  );
  await cli("set", "viewport", "1440", "1100");
  await cli("open", base + "/settings");
  await waitFor(`document.querySelector('input[name="name"]') !== null`);
  await click("Sign out");
  await waitFor(
    `document.querySelector('a[aria-label="Open account settings"]') === null`,
  );
  await cli("open", base + "/login");
  await cli("fill", 'input[name="email"]', email);
  await cli("fill", 'input[name="password"]', password);
  await click("Sign in to ZetaInstall");
  await waitFor(
    `document.querySelector('a[aria-label="Open account settings"]') !== null`,
  );
  await cli("open", base + "/settings");
  await waitFor(`document.querySelector('input[name="name"]') !== null`);
  await click("Delete account");
  await cli("fill", '[role="dialog"] input[name="password"]', password);
  await click("Confirm securely");
  await waitFor(
    `document.querySelector('a[aria-label="Open account settings"]') === null`,
  );
  created = false;
  await cli("open", base + "/");
  console.log(
    "PASS browser E2E: register, generate/download/OpenSSH, mobile navigation/overflow/axe, logout/login, account deletion.",
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
  if (created) {
    try {
      const cleaned = await evaluate(
        `(async () => { const s = await (await fetch('/api/session')).json(); if(s.user?.email === ${JSON.stringify(email)}) { const r = await fetch('/api/me', {method:'DELETE', headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf}, body:JSON.stringify({password:${JSON.stringify(password)}})}); return r.ok; } return false; })()`,
      );
      if (!cleaned)
        console.error(
          "Synthetic browser account cleanup is outstanding:",
          email,
        );
    } catch {
      console.error("Synthetic browser account cleanup is outstanding:", email);
    }
  }
}
