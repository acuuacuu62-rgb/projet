import ssh2, { type ConnectConfig, type Client as SSHClient } from "ssh2";
const { Client } = ssh2;
import { readFile } from "node:fs/promises";
import { destination, fingerprint } from "./security";
export function scanFailure(error: {
  code?: string;
  level?: string;
  message?: string;
}) {
  if (error.code === "ECONNREFUSED")
    return "SSH port refused the connection. Check that sshd is running and listening on this port.";
  if (
    ["ENETUNREACH", "EHOSTUNREACH", "EADDRNOTAVAIL"].includes(error.code || "")
  )
    return "SSH network is unreachable from the ZetaInstall worker. Check routing, IPv4/IPv6 availability and the provider firewall.";
  if (error.code === "ETIMEDOUT" || error.level === "client-timeout")
    return "SSH handshake timed out before the host key was received. Check provider/local firewall rules, source-IP restrictions and SSH connection limits.";
  if (/no matching|no (?:kex|host key|cipher)/i.test(error.message || ""))
    return "SSH algorithm negotiation failed. Update the target SSH server configuration to support modern algorithms; host key verification has not been disabled.";
  if (error.code === "ECONNRESET")
    return "SSH connection was reset before its host key was received. Check sshd logs, Fail2ban and provider connection limits for the worker IP.";
  return "SSH connection closed before its host key was received. Verify that this port serves SSH and check sshd logs and source-IP restrictions.";
}

// Internal transport helper; public requests must pass destination() validation first.
export function scanSSHAddress(ip: string, port: number, timeout = 20000) {
  return new Promise<{ ip: string; fingerprint: string }>((resolve, reject) => {
    const client = new Client();
    let found = "",
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      if (found) resolve({ ip, fingerprint: found });
      else reject(error || new Error(scanFailure({})));
    };
    const timer = setTimeout(
      () => finish(new Error(scanFailure({ code: "ETIMEDOUT" }))),
      timeout,
    );
    client.on("error", (error: Error & { code?: string; level?: string }) =>
      finish(new Error(scanFailure(error))),
    );
    client.on("close", () => finish());
    client.on("end", () => finish());
    try {
      client.connect({
        host: ip,
        port,
        username: "zetainstall-fingerprint-only",
        readyTimeout: timeout,
        hostVerifier: (key: Buffer) => {
          found = fingerprint(key);
          // Abort before authentication; the user must approve this fingerprint first.
          return false;
        },
      });
    } catch {
      finish(new Error(scanFailure({})));
    }
  });
}
export async function scanHost(host: string, port: number) {
  return scanSSHAddress(await destination(host), port);
}
export async function connect(server: any, credential: any) {
  const ip = await destination(server.host);
  if (ip !== server.ip)
    throw new Error("DNS address changed. Test and trust the server again.");
  const client = new Client();
  const config: ConnectConfig = {
    host: ip,
    port: server.port,
    username: server.username,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    hostVerifier: (key: Buffer) =>
      fingerprint(key as Buffer) === server.fingerprint,
  };
  if (server.auth === "password") config.password = credential.password;
  else {
    config.privateKey = credential.private_key;
    config.passphrase = credential.passphrase;
  }
  await new Promise<void>((resolve, reject) => {
    client.once("ready", resolve);
    client.on("error", () =>
      reject(
        new Error(
          "SSH authentication or host key verification failed. Check credentials and the pinned host fingerprint.",
        ),
      ),
    );
    client.connect(config);
  });
  return client;
}
export async function remote(
  client: SSHClient,
  action: string,
  config: any,
  onEvent: (e: any) => Promise<void> = async () => {},
  asRoot = false,
) {
  const source = await readFile(
    new URL("../runner/agent.py", import.meta.url),
    "utf8",
  );
  const encoded = Buffer.from(source).toString("base64");
  // This command contains only our fixed audited runner, never a user-controlled shell fragment.
  const command = `${asRoot ? "" : "sudo -n "}python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`;
  return new Promise<any>((resolve, reject) => {
    let buffer = "",
      result: any;
    let sequence = Promise.resolve();
    let size = 0;
    const timeout = setTimeout(
      () => {
        client.end();
        reject(
          new Error(
            "Remote operation timed out. Reconcile the target before retrying.",
          ),
        );
      },
      !["probe", "diagnostics", "firewall_check", "ssl_check"].includes(action)
        ? 3600000
        : 90000,
    );
    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timeout);
        reject(
          new Error(
            "Cannot start the privileged runner. Root or passwordless sudo and Python 3 are required.",
          ),
        );
        return;
      }
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_000_000) {
          stream.close();
          return;
        }
        buffer += chunk.toString();
        let n;
        while ((n = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, n);
          buffer = buffer.slice(n + 1);
          try {
            const event = JSON.parse(line);
            if (event.kind === "result") result = event.data;
            else if (event.kind === "error") result = { error: event.message };
            else if (event.kind === "step")
              sequence = sequence.then(() =>
                onEvent({
                  step: String(event.step).slice(0, 120),
                  progress: Math.max(
                    0,
                    Math.min(99, Number(event.progress) || 0),
                  ),
                }),
              );
            void sequence.catch(() => {});
          } catch {}
        }
      });
      stream.stderr.resume();
      stream.on("close", (code: number) => {
        clearTimeout(timeout);
        sequence
          .then(() => {
            if (code !== 0 || result?.error)
              reject(
                new Error(
                  result?.error ||
                    "Remote runner failed. Python 3 and passwordless sudo must be available.",
                ),
              );
            else if (!result)
              reject(new Error("No verified result from remote runner."));
            else resolve(result);
          })
          .catch(reject);
      });
      stream.end(JSON.stringify({ action, config }));
    });
  });
}
