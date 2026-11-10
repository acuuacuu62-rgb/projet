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
for (const path of ["/install/panel", "/install/wings", "/upcloud"]) {
  await cli("set", "viewport", "1440", "1100");
  await cli("open", base + path);
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
await cli("set", "viewport", "1440", "1100");
await cli("open", base + "/install/panel");
await waitForHydration();
await cli("select", 'select[name="os_profile"]', "ubuntu-22.04");
console.log("Browser profile checks passed. No real installation performed.");
