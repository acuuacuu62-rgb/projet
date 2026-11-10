"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Copy,
  Download,
  KeyRound,
  ShieldCheck,
  Check,
  Plus,
  ScanLine,
  Server,
  Cloud,
  Mail,
  Lock,
} from "lucide-react";
import { api, download } from "@/lib/client";
import { providers } from "@/lib/contracts";
import { useWorkspace } from "./context";
import { Modal, Notice, Field, Busy, Logo, Heading, DocsLink } from "./ui";
export function AuthForm({
  mode = "login",
  onDone,
  onMode,
}: {
  mode?: string;
  onDone: () => void;
  onMode: (v: string) => void;
}) {
  const { refresh, notice } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const register = mode === "register",
    forgot = mode === "forgot";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await api(
        "/auth/" +
          (forgot ? "forgot-password" : register ? "register" : "login"),
        "POST",
        data,
      );
      if (forgot) setMessage(res.message);
      else {
        await refresh();
        notice(
          register
            ? "Your workspace is ready. Welcome to ZetaInstall."
            : "Welcome back to your workspace.",
        );
        onDone();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="auth-mark">
        <Logo size={31} />
        <span className="eyebrow">YOUR INFRASTRUCTURE STARTS HERE</span>
      </div>
      <p className="modal-description">
        {register
          ? "One secure workspace for your servers, keys, and deployments."
          : forgot
            ? "Enter your account email to receive a secure password reset link."
            : "Sign in to manage your servers and continue building."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <Field label="Full name">
            <input
              autoComplete="name"
              name="name"
              placeholder="Your name"
              required
              minLength={2}
              maxLength={70}
            />
          </Field>
        )}
        <Field label="Email address">
          <input
            type="email"
            autoComplete="email"
            name="email"
            placeholder="you@example.com"
            required
          />
        </Field>
        {!forgot && (
          <Field
            label="Password"
            hint={
              register
                ? "Use at least 12 characters. A password manager is recommended."
                : undefined
            }
          >
            <input
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="Enter your password"
              required
              minLength={register ? 12 : 1}
              maxLength={128}
            />
          </Field>
        )}
        {!register && !forgot && (
          <button
            type="button"
            className="text-link"
            onClick={() => onMode("forgot")}
          >
            Forgot password?
          </button>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        {message && <div className="inline-success">{message}</div>}
        <button
          className="btn primary"
          style={{ width: "100%", marginTop: 22 }}
          disabled={busy}
        >
          <Busy busy={busy}>
            {forgot
              ? "Send reset link"
              : register
                ? "Create your workspace"
                : "Sign in to ZetaInstall"}
          </Busy>
          <ArrowRight size={14} />
        </button>
      </form>
      <div className="auth-footer">
        {register
          ? "Already have an account? "
          : forgot
            ? "Remember your password? "
            : "New to ZetaInstall? "}
        <button
          onClick={() => onMode(register || forgot ? "login" : "register")}
        >
          {register || forgot ? "Sign in" : "Create an account"}
        </button>
      </div>
    </>
  );
}
export function KeyDialog({ onClose }: { onClose: () => void }) {
  const { refresh, notice } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<any>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      setResult(
        await api("/keys", "POST", {
          name: f.get("name"),
          description: f.get("description"),
          algorithm: f.get("algorithm"),
          passphrase: f.get("passphrase") || undefined,
          consent: f.get("consent") === "on",
        }),
      );
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={result ? "Your SSH key is ready" : "Generate an SSH key"}
      onClose={onClose}
    >
      {result ? (
        <>
          <span className="pill green">
            <Check size={10} /> Generated & encrypted
          </span>
          <h3 style={{ fontSize: 15, marginTop: 20 }}>{result.name}</h3>
          <p className="modal-description">
            Copy the public key to your VPS. Download the private key and keep
            it somewhere safe.
          </p>
          <pre className="code-block">{result.public_key}</pre>
          <div
            className="heading-actions"
            style={{ marginTop: 16, flexWrap: "wrap" }}
          >
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard
                  .writeText(result.public_key)
                  .then(() => notice("Public key copied"))
                  .catch(() =>
                    notice(
                      "Clipboard unavailable. Download the public key instead.",
                      true,
                    ),
                  );
              }}
            >
              <Copy />
              Copy public key
            </button>
            <button
              className="btn"
              onClick={() => download(result.name + ".pub", result.public_key)}
            >
              <Download />
              Public key
            </button>
            <button
              className="btn primary"
              onClick={() => download(result.name, result.private_key)}
            >
              <Download />
              Private key
            </button>
          </div>
          <Notice info>
            Install the public key using an existing SSH connection or your
            provider console. Never share the private key.
          </Notice>
          <DocsLink topic={4} />
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="modal-description">
            A dedicated key gives ZetaInstall a secure way to connect to your
            VPS.
          </p>
          <Field label="Key name">
            <input
              name="name"
              placeholder="e.g. production-server-key"
              required
              minLength={2}
              maxLength={70}
            />
          </Field>
          <div className="form-grid">
            <Field label="Algorithm">
              <select name="algorithm">
                <option value="ed25519">Ed25519 · Recommended</option>
                <option value="rsa">RSA · 4096 bit</option>
              </select>
            </Field>
            <Field label="Passphrase (optional)">
              <input
                name="passphrase"
                type="password"
                placeholder="Protect the exported key"
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input
              name="description"
              placeholder="What will this key be used for?"
              maxLength={500}
            />
          </Field>
          <Notice info>
            This release generates keys on the backend and stores private keys
            encrypted in your account’s vault. Only you can export them after
            password confirmation.
          </Notice>
          <label className="checkbox">
            <input type="checkbox" name="consent" required />I approve backend
            generation and encrypted storage of this key.
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              <Busy busy={busy}>
                <KeyRound size={14} />
                Generate key
              </Busy>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function PasswordDialog({
  title,
  description,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  onSubmit: (pw: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-description">{description}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const pw = String(new FormData(e.currentTarget).get("password"));
          setBusy(true);
          try {
            await onSubmit(pw);
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Confirm your password">
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </Field>
        {error && <div className="inline-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            <Busy busy={busy}>Confirm securely</Busy>
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AddServer() {
  const ctx = useWorkspace(),
    router = useRouter();
  const [mode, setMode] = useState("universal"),
    [stage, setStage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [probe, setProbe] = useState<any>(null),
    [test, setTest] = useState<any>(null);
  async function scan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ctx.requireAuth()) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const server = {
      name: f.get("name"),
      provider: mode === "upcloud" ? "UpCloud" : f.get("provider"),
      mode,
      host: f.get("host"),
      port: Number(f.get("port")),
      username: f.get("username"),
      auth: f.get("auth"),
      key_id: f.get("auth") === "key" ? f.get("key_id") : undefined,
      password: f.get("auth") === "password" ? f.get("password") : undefined,
      passphrase: f.get("passphrase") || undefined,
      description: f.get("description") || "",
    };
    try {
      const p = await api("/connections/scan", "POST", {
        host: server.host,
        port: server.port,
      });
      setDraft(server);
      setProbe(p);
      setStage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function testConnection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/connections/test", "POST", {
        server: { ...draft, fingerprint: probe.fingerprint },
        probe_id: probe.id,
        trust: true,
      });
      setTest(result);
      setStage(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await api("/servers", "POST", {
        server: { ...draft, fingerprint: probe.fingerprint },
        test_id: test.test_id,
      });
      await ctx.refresh();
      ctx.notice("VPS connected and saved to your workspace.");
      router.push("/servers");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Add a VPS"
        description="Your provider. Your server. One secure connection."
      />
      <div className="split-layout">
        <div>
          <div className="stepper">
            {[
              "01  Connection details",
              "02  Verify identity",
              "03  System check",
            ].map((s, i) => (
              <span key={s} className={stage === i ? "current" : ""}>
                {s}
              </span>
            ))}
          </div>
          {stage === 0 ? (
            <>
              <div className="mode-cards">
                <button
                  className={`mode-card ${mode === "universal" ? "selected" : ""}`}
                  onClick={() => setMode("universal")}
                >
                  <Server size={21} />
                  <h2>Universal VPS</h2>
                  <p>
                    Connect any compatible provider over SSH. No API keys
                    needed.
                  </p>
                </button>
                <button
                  className={`mode-card ${mode === "upcloud" ? "selected" : ""}`}
                  onClick={() => setMode("upcloud")}
                >
                  <Cloud size={21} />
                  <h2>UpCloud Special Setup</h2>
                  <p>
                    A separate workflow for networking, TLS, and reverse proxy
                    setup.
                  </p>
                </button>
              </div>
              <div className="panel pad">
                <form onSubmit={scan}>
                  <div className="form-grid">
                    <Field label="Server name">
                      <input
                        name="name"
                        placeholder="e.g. production-eu-01"
                        required
                        minLength={2}
                        maxLength={70}
                      />
                    </Field>
                    <Field label="VPS provider">
                      <select
                        name="provider"
                        disabled={mode === "upcloud"}
                        defaultValue="UpCloud"
                      >
                        {providers.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Public IP address or hostname">
                      <input
                        name="host"
                        placeholder="203.0.113.10"
                        required
                        maxLength={253}
                      />
                    </Field>
                    <Field label="SSH port">
                      <input
                        name="port"
                        type="number"
                        min={1}
                        max={65535}
                        defaultValue={22}
                        required
                      />
                    </Field>
                    <Field label="SSH username">
                      <input
                        name="username"
                        placeholder="root"
                        defaultValue="root"
                        required
                      />
                    </Field>
                    <Field label="Authentication method">
                      <select name="auth" defaultValue="key">
                        <option value="key">
                          SSH private key · Recommended
                        </option>
                        <option value="password">SSH password</option>
                      </select>
                    </Field>
                    <Field label="SSH key">
                      <select name="key_id">
                        <option value="">Select a key from your vault</option>
                        {ctx.keys.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name} ({k.algorithm})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Key passphrase (if set)">
                      <input
                        name="passphrase"
                        type="password"
                        autoComplete="off"
                        placeholder="Required for encrypted keys"
                      />
                    </Field>
                    <Field label="SSH password (password method only)">
                      <input
                        name="password"
                        type="password"
                        autoComplete="off"
                        placeholder="Only used for password authentication"
                      />
                    </Field>
                    <Field label="Description (optional)">
                      <input
                        name="description"
                        maxLength={500}
                        placeholder="A little context for this server"
                      />
                    </Field>
                  </div>
                  <Notice info>
                    We first retrieve the host fingerprint without sending your
                    password or private key. Compare it with your provider
                    console before continuing.
                  </Notice>
                  {error && <div className="inline-error">{error}</div>}
                  <div className="form-actions">
                    <button className="btn primary" disabled={busy}>
                      <Busy busy={busy}>
                        <ScanLine size={14} />
                        Scan host identity
                      </Busy>
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : stage === 1 ? (
            <div className="panel pad">
              <div className="form-intro">
                <h2>Is this your server?</h2>
                <p>
                  Verify this fingerprint through your provider’s trusted
                  console. A network scan alone does not prove the server’s
                  identity.
                </p>
              </div>
              <div className="code-block">
                <div>
                  {draft.host}:{draft.port}
                </div>
                <div className="fingerprint">{probe.fingerprint}</div>
              </div>
              <form onSubmit={testConnection}>
                <label className="checkbox">
                  <input type="checkbox" required />I compared this host
                  fingerprint with a trusted out-of-band source and it matches.
                </label>
                {error && <div className="inline-error">{error}</div>}
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setStage(0);
                      setDraft(null);
                      setProbe(null);
                    }}
                  >
                    Back to details
                  </button>
                  <button className="btn primary" disabled={busy}>
                    <Busy busy={busy}>
                      <ShieldCheck size={14} />
                      Trust & test connection
                    </Busy>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="panel pad">
              <span className="pill green">
                <Check size={11} /> SSH identity and authentication verified
              </span>
              <h2 style={{ fontSize: 19, margin: "22px 0" }}>
                Here’s what we found
              </h2>
              <div className="evidence-grid">
                {Object.entries({
                  OS: test.evidence.os,
                  Architecture: test.evidence.architecture,
                  CPU: test.evidence.cpus + " cores",
                  RAM:
                    (test.evidence.ram_bytes / 1024 ** 3).toFixed(1) + " GiB",
                  "Free disk":
                    (test.evidence.disk_free / 1024 ** 3).toFixed(1) + " GiB",
                  Privileges: test.evidence.root ? "Root / sudo" : "Limited",
                }).map(([k, v]) => (
                  <div className="evidence-box" key={k}>
                    <small>{k}</small>
                    <strong>{String(v)}</strong>
                  </div>
                ))}
              </div>
              <Notice info>
                A saved connection does not mean the OS supports every
                installer. Each installation runs its own compatibility and
                safety checks.
              </Notice>
              {error && <div className="inline-error">{error}</div>}
              <div className="form-actions">
                <button className="btn" onClick={() => setStage(0)}>
                  Start over
                </button>
                <button className="btn primary" disabled={busy} onClick={save}>
                  <Busy busy={busy}>
                    <Plus />
                    Save verified VPS
                  </Busy>
                </button>
              </div>
            </div>
          )}
        </div>
        <aside className="panel pad side-info">
          <div className="install-icon">
            <Lock size={19} />
          </div>
          <h2 style={{ marginTop: 20 }}>A secure connection, by design.</h2>
          <p>
            Only your account can access this server’s credentials and
            installation history.
          </p>
          <ul>
            <li>Host key verification is always required.</li>
            <li>Private credentials are encrypted at rest.</li>
            <li>
              Root or passwordless sudo and Python 3 are needed for the fixed
              runner.
            </li>
            <li>Private and reserved IP ranges are blocked.</li>
            <li>Removing a server never deletes the VPS.</li>
          </ul>
          <DocsLink topic={2}>Need help connecting?</DocsLink>
        </aside>
      </div>
    </>
  );
}
