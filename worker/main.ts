import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { connect, remote } from "../backend/ssh";
const endpoint = `http://127.0.0.1:${process.env.INTERNAL_PORT || 4001}`;
const keyfile =
  resolve(process.env.KEY_DIR || (process.env.DATA_DIR || ".data") + "/keys") +
  "/worker.token";
let auth = "";
let stopping = false;
let active: any = null;
async function call(route: string, data: any = {}) {
  if (!auth) auth = (await readFile(keyfile, "utf8")).trim();
  const r = await fetch(endpoint + route, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Worker lease/API unavailable");
  return r.json();
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function update(
  job: any,
  status: string,
  step: string,
  progress: number,
  extra: any = {},
) {
  return call("/update", {
    id: job.id,
    epoch: job.epoch,
    status,
    step,
    progress,
    ...extra,
  });
}
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    stopping = true;
    if (!active) process.exit(0);
  });
console.log("ZetaInstall worker started; awaiting persistent queue.");
while (!stopping) {
  try {
    const job = await call("/claim");
    if (!job) {
      await call("/heartbeat");
      await wait(2000);
      continue;
    }
    active = job;
    let leaseLost = false;
    let cancel = false;
    const heartbeat = setInterval(() => {
      call("/heartbeat", { id: job.id, epoch: job.epoch })
        .then((r: any) => {
          cancel = r.cancel_requested;
        })
        .catch(() => {
          leaseLost = true;
        });
    }, 5000);
    let ssh;
    try {
      ssh = await connect(job.server, job.credential);
      if (leaseLost)
        throw new Error("Worker lease lost; reconcile before retrying");
      if (cancel) {
        await update(job, "Cancelled", "Cancelled before remote action", 0);
        continue;
      }
      await update(
        job,
        "Preparing",
        "SSH identity verified; preparing fixed runner",
        8,
      );
      if (
        ["install_wings", "configure_wings", "upcloud_setup"].includes(job.type)
      ) {
        const doc = parseDocument(job.config.yaml, { uniqueKeys: true });
        if (doc.errors.length) throw new Error("Invalid Wings YAML");
        const parsed = doc.toJS({ maxAliasCount: 0 });
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Invalid Wings configuration");
        job.config.wings_config = parsed;
        delete job.config.yaml;
      }
      const isRead = ["diagnostics", "firewall_check", "ssl_check"].includes(
        job.type,
      );
      const result = await remote(
        ssh,
        job.type,
        job.config,
        async (e) => {
          if (leaseLost) throw new Error("Worker lease lost");
          await update(
            job,
            isRead
              ? "Verifying"
              : e.progress >= 75
                ? "Configuring"
                : "Installing",
            e.step,
            e.progress,
          );
        },
        job.server.username === "root",
      );
      if (leaseLost)
        throw new Error("Worker lease lost; remote state must be reconciled");
      await update(job, "Verifying", "Checking remote postconditions", 97);
      if (result.verification_incomplete)
        await update(
          job,
          "Failed",
          "Installation applied; Panel-side verification required",
          97,
          {
            result,
            error:
              "Wings API is verified, but Panel-to-Wings connectivity still requires verification from the Panel host. Installation is not marked complete.",
          },
        );
      else
        await update(
          job,
          "Completed",
          isRead
            ? "Diagnostics completed with observed evidence"
            : "Required service checks passed",
          100,
          { result },
        );
    } catch (e: any) {
      await update(
        job,
        "Failed",
        "Operation stopped; review diagnostics before retrying",
        0,
        { error: String(e.message).slice(0, 500) },
      ).catch(() => {});
    } finally {
      clearInterval(heartbeat);
      if (job.server?.temporary) {
        ssh?.destroy();
        job.credential = null;
        job.config = null;
        job.server = null;
      } else ssh?.end();
      active = null;
    }
  } catch {
    await wait(3000);
  }
}
