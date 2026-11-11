// Uses the shared CodeRabbit Preview browser. No account, VPS or SSH mutations.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const cli = async (...args) =>
  (
    await exec("coderabbit-agent-browser", args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
const evaluate = async (code) => JSON.parse(await cli("eval", code));
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
const waitForHydration = async () => {
  for (let i = 0; i < 50; i++) {
    if (
      await evaluate(
        `Object.keys(document.querySelector('select[name="os_profile"]') || {}).some(k => k.startsWith('__reactProps'))`,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Installer form did not hydrate");
};
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("Use a local synthetic target");
const fixture = {
  user: {
    id: "synthetic",
    name: "Fixture",
    email: "fixture@example.test",
    role: "user",
  },
  csrf: "synthetic",
  health: { installers_enabled: false },
  servers: [],
  keys: [],
  nodes: [],
  domains: [],
  jobs: [],
  activity: [],
};
await cli(
  "network",
  "route",
  "**/api/workspace",
  "--body",
  JSON.stringify(fixture),
);
await cli(
  "network",
  "route",
  "**/api/connections/scan",
  "--body",
  JSON.stringify({
    id: "fixture-scan",
    fingerprint: "SHA256:" + "A".repeat(43),
  }),
);
await cli(
  "network",
  "route",
  "**/api/connections/test",
  "--body",
  JSON.stringify({
    test_id: "fixture-test",
    evidence: {
      os: "Ubuntu 22.04",
      os_id: "ubuntu",
      os_version: "22.04",
      architecture: "x86_64",
      cpus: 2,
      ram_bytes: 4294967296,
      disk_free: 20000000000,
      root: true,
    },
  }),
);
async function connectFixture() {
  await cli("wait", 'input[name="host"]');
  await cli("wait", 'a[aria-label="Open account settings"]');
  await cli("fill", 'input[name="name"]', "Temporary fixture");
  await cli("fill", 'input[name="host"]', "8.8.8.8");
  await cli("select", 'select[name="auth"]', "password");
  await cli("fill", 'input[name="password"]', "synthetic-secret");
  await cli("find", "role", "button", "click", "--name", "Scan host identity");
  await cli("check", 'input[type="checkbox"][required]');
  await cli(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Trust & test connection",
  );
  await cli(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Continue to installation",
  );
}
try {
  for (const path of ["/install/panel", "/install/wings", "/upcloud"]) {
    await cli("set", "viewport", "1440", "1100");
    await cli("open", base + path);
    await connectFixture();
    await cli("wait", 'select[name="os_profile"]');
    await waitForHydration();
    assert.deepEqual(
      await evaluate(
        `Array.from(document.querySelector('select[name="os_profile"]').options).map(o => o.value)`,
      ),
      ["ubuntu-24.04", "ubuntu-22.04"],
    );
    for (const profile of ["ubuntu-22.04", "ubuntu-24.04"]) {
      await cli("select", 'select[name="os_profile"]', profile);
      const wing = path !== "/install/panel";
      const expected = wing
        ? "No PHP repository changes are made."
        : profile === "ubuntu-22.04"
          ? "This adds a third-party package source."
          : "The Ubuntu 22.04 PHP PPA is not added.";
      assert.equal(
        await evaluate(
          `new FormData(document.querySelector('select[name="os_profile"]').form).get('os_profile')`,
        ),
        profile,
      );
      assert.equal(
        await evaluate(
          `document.body.innerText.includes(${JSON.stringify(expected)})`,
        ),
        true,
      );
    }
    await cli("set", "viewport", "390", "844");
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      true,
    );
    const axe = JSON.parse(await cli("a11y", "--json"));
    assert.equal(
      axe.data.counts.violations,
      0,
      path + " accessibility violations",
    );
    console.log(
      path +
        ": profiles and FormData verified, mobile overflow check passed, axe zero violations",
    );
  }
  console.log(
    "Profile and temporary-connection UI checks passed using synthetic network fixtures. No real SSH or installation performed.",
  );
} finally {
  await cli("network", "unroute");
}
