import { spawn } from "node:child_process";
const children = [
  ["tsx", ["backend/main.ts"]],
  ["tsx", ["worker/main.ts"]],
  ["next", ["dev", "--hostname", "0.0.0.0"]],
].map(([cmd, args]) =>
  spawn(cmd as string, args as string[], {
    stdio: "inherit",
    env: process.env,
  }),
);
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
children.forEach((child) =>
  child.on("exit", (code) => {
    if (!closing) {
      process.exitCode = code || 1;
      stop();
    }
  }),
);
