"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Server,
  KeyRound,
  Download,
  Copy,
  Trash2,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Network,
  Globe,
  Activity,
  Terminal,
  Play,
  Check,
  Settings,
  LogOut,
  Monitor,
  Layers,
  Boxes,
  Cloud,
  Lock,
  FileText,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  Mail,
} from "lucide-react";
import { api, download, relative } from "@/lib/client";
import { articles } from "@/lib/docs";
import {
  installationProfiles,
  detectedProfile,
  profileLabel,
} from "@/lib/installation-profiles";
import { useWorkspace } from "./context";
import {
  Heading,
  Empty,
  Modal,
  Field,
  Notice,
  Badge,
  Busy,
  DocsLink,
} from "./ui";
import {
  KeyDialog,
  PasswordDialog,
  AuthForm,
  InstallationConnection,
} from "./forms";
import { ServerTable, InstallCards } from "./dashboard";
export function Keys() {
  const c = useWorkspace();
  const [open, setOpen] = useState(false),
    [exportKey, setExportKey] = useState<any>(null),
    [remove, setRemove] = useState<any>(null);
  return (
    <>
      <Heading
        title="SSH Key Manager"
        description="Your secure access, organized. Generate, download, and manage your keys."
      >
        <button
          className="btn primary"
          onClick={() => c.requireAuth() && setOpen(true)}
        >
          <Plus />
          Generate SSH key
        </button>
      </Heading>
      <div className="notice info" style={{ marginBottom: 25 }}>
        <ShieldCheck />
        <div>
          Private keys are encrypted in your vault. Exports require your
          password.{" "}
          <Link href="/documentation?article=3" style={{ color: "#c5a9ff" }}>
            Learn about key custody ↗
          </Link>
        </div>
      </div>
      {c.keys.length ? (
        <div className="keys-grid">
          {c.keys.map((k) => (
            <div className="panel key-card" key={k.id}>
              <div className="key-card-head">
                <div className="install-icon">
                  <KeyRound />
                </div>
                <span className="pill purple">
                  {k.algorithm === "rsa" ? "RSA 4096" : "ED25519"}
                </span>
              </div>
              <h2>{k.name}</h2>
              <p>{k.description || "Managed encrypted SSH key"}</p>
              <pre className="code-block">{k.fingerprint}</pre>
              <div className="key-metadata">
                <span>Created {relative(k.created_at)}</span>
                <span>{k.in_use ? `${k.in_use} server(s)` : "Not in use"}</span>
              </div>
              <div className="key-card-actions">
                <button
                  className="btn small"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(k.public_key)
                      .then(() => c.notice("Public key copied"))
                      .catch(() =>
                        c.notice(
                          "Clipboard unavailable. Use Download public.",
                          true,
                        ),
                      )
                  }
                >
                  <Copy />
                  Copy public
                </button>
                <button
                  className="btn small"
                  onClick={() => download(k.name + ".pub", k.public_key)}
                >
                  <Download />
                  Public
                </button>
                <button className="btn small" onClick={() => setExportKey(k)}>
                  <Lock />
                  Private
                </button>
                <button
                  className="icon-btn"
                  aria-label={"Delete " + k.name}
                  onClick={() => setRemove(k)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            large
            title="Your keys. Your access."
            description="Generate your first SSH key to securely connect a VPS. Choose Ed25519 or RSA 4096, and download your private key."
            icon={<KeyRound />}
          >
            <button
              className="btn primary"
              onClick={() => c.requireAuth() && setOpen(true)}
            >
              <Plus />
              Generate your first key
            </button>
          </Empty>
        </div>
      )}
      <div style={{ marginTop: 23 }}>
        <DocsLink topic={4}>How do I install my public key?</DocsLink>
      </div>
      {open && <KeyDialog onClose={() => setOpen(false)} />}{" "}
      {exportKey && (
        <PasswordDialog
          title="Export private key"
          description={`Confirm your password to download “${exportKey.name}”. This action is recorded in your audit log.`}
          onClose={() => setExportKey(null)}
          onSubmit={async (password) => {
            const r = await api("/keys/" + exportKey.id + "/export", "POST", {
              password,
            });
            download(r.name, r.private_key);
            c.notice("Private key downloaded. Store it securely.");
          }}
        />
      )}
      {remove && (
        <Confirm
          title="Delete SSH key?"
          description="This removes the encrypted key from your vault. It does not remove public keys already installed on a VPS. Keys in use cannot be deleted."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api("/keys/" + remove.id, "DELETE", {});
            await c.refresh();
            c.notice("SSH key removed from vault");
          }}
        />
      )}
    </>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-description">{description}</p>
      {error && <div className="inline-error">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Busy busy={busy}>Confirm</Busy>
        </button>
      </div>
    </Modal>
  );
}
export function Servers() {
  const c = useWorkspace();
  const [search, setSearch] = useState("");
  return (
    <>
      <Heading
        title="Previously saved servers"
        description="Manage existing records. New installations use a temporary connection."
      >
        <Link href="/installation-center" className="btn primary">
          <Plus />
          Install directly
        </Link>
      </Heading>
      <div className="panel">
        <div className="panel-header">
          <h2>
            Connected servers <span className="count">{c.servers.length}</span>
          </h2>
          <input
            className="input"
            aria-label="Search servers"
            placeholder="Search servers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
        </div>
        <ServerTable search={search} />
        <div className="panel-footer">
          <ShieldCheck />
          Removing a server only disconnects it from ZetaInstall. Your VPS
          remains yours.
        </div>
      </div>
    </>
  );
}
export function ServerDetail({ id }: { id: string }) {
  const c = useWorkspace(),
    router = useRouter(),
    s = c.servers.find((x) => x.id === id);
  const [tab, setTab] = useState("Overview"),
    [remove, setRemove] = useState(false),
    [rename, setRename] = useState(false);
  if (!s)
    return (
      <>
        <Heading
          title="Server details"
          description="Only verified servers in your workspace are accessible."
        />
        <div className="panel">
          <Empty
            title="Server not available"
            description="Sign in to its owner account, or connect your first server."
          >
            <Link href="/servers" className="btn">
              Back to servers
            </Link>
          </Empty>
        </div>
      </>
    );
  const evidence = s.latest_diagnostics || s.evidence;
  return (
    <>
      <Heading
        title={s.name}
        description={`${s.provider} · ${s.host} · Last verified ${relative(s.last_verified_at)}`}
      >
        <button className="btn" onClick={() => setRename(true)}>
          <Settings />
          Edit
        </button>
        <Link href={"/diagnostics?server=" + id} className="btn primary">
          <Activity />
          Run diagnostics
        </Link>
      </Heading>
      <div className="tabs">
        {[
          "Overview",
          "Connection",
          "Resources",
          "Installed Services",
          "Panel Status",
          "Wings Status",
          "SSL Status",
          "Firewall Status",
          "Installation History",
        ].map((t) => (
          <button
            key={t}
            className={"tab " + (tab === t ? "active" : "")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {["Overview", "Connection", "Resources"].includes(tab) ? (
        <div className="panel pad">
          <div className="section-heading">
            <h2 className="section-title">Verified connection details</h2>
            <Badge status={s.status} />
          </div>
          <div className="evidence-grid">
            {Object.entries(
              tab === "Connection"
                ? {
                    Host: s.host,
                    Port: s.port,
                    Username: s.username,
                    Authentication:
                      s.auth === "key" ? "SSH private key" : "SSH password",
                    Provider: s.provider,
                    Mode: s.mode,
                  }
                : tab === "Resources"
                  ? {
                      CPU: evidence.cpus + " cores",
                      RAM: (evidence.ram_bytes / 1024 ** 3).toFixed(1) + " GiB",
                      "Free disk":
                        (evidence.disk_free / 1024 ** 3).toFixed(1) + " GiB",
                      "Total disk":
                        (evidence.disk_total / 1024 ** 3).toFixed(1) + " GiB",
                      Architecture: evidence.architecture,
                      Privileges: evidence.root ? "Root / sudo" : "Limited",
                    }
                  : {
                      OS: evidence.os,
                      Address: s.host,
                      Architecture: evidence.architecture,
                      CPU: evidence.cpus + " cores",
                      RAM: (evidence.ram_bytes / 1024 ** 3).toFixed(1) + " GiB",
                      "Free disk":
                        (evidence.disk_free / 1024 ** 3).toFixed(1) + " GiB",
                    },
            ).map(([k, v]) => (
              <div className="evidence-box" key={k}>
                <small>{k}</small>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          <h4 style={{ fontSize: 11, marginTop: 25, color: "#8e99b1" }}>
            PINNED HOST FINGERPRINT
          </h4>
          <pre className="code-block">{s.fingerprint}</pre>
          <div className="form-actions">
            <Link href="/installation-center" className="btn">
              <Play />
              Installation Center
            </Link>
            <button className="btn danger" onClick={() => setRemove(true)}>
              <Trash2 />
              Remove from workspace
            </button>
          </div>
        </div>
      ) : tab === "Installation History" ? (
        <History filter={s.id} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <h2>{tab}</h2>
            <Link href={"/diagnostics?server=" + id} className="text-link">
              Recheck
              <RefreshCw size={12} />
            </Link>
          </div>
          {evidence.checks
            ?.filter((x: any) =>
              tab === "Installed Services"
                ? [
                    "nginx",
                    "php8.3-fpm",
                    "mariadb",
                    "redis-server",
                    "docker",
                    "wings",
                    "pteroq",
                  ].includes(x.name)
                : tab === "Panel Status"
                  ? ["nginx", "php8.3-fpm", "mariadb", "pteroq"].includes(
                      x.name,
                    )
                  : tab === "Wings Status"
                    ? ["wings", "docker"].includes(x.name)
                    : tab === "Firewall Status"
                      ? [
                          "ufw",
                          "nft",
                          "iptables",
                          "listening_ports",
                          "provider_firewall",
                        ].includes(x.name)
                      : false,
            )
            .map((x: any) => (
              <div className="check-result" key={x.name}>
                <div className="check-result-head">
                  <span>{x.name}</span>
                  <Badge status={x.status} />
                </div>
                <p>{x.explanation}</p>
              </div>
            ))}
          {tab === "SSL Status" && (
            <Empty
              icon={<Globe />}
              title="Inspect domain certificates"
              description="TLS checks require a domain associated with this server."
            >
              <Link href="/ssl" className="btn">
                Open SSL Manager
              </Link>
            </Empty>
          )}
        </div>
      )}
      {remove && (
        <Confirm
          title="Remove server?"
          description="Only this workspace connection will be removed. The VPS and all installed services remain untouched."
          onClose={() => setRemove(false)}
          onConfirm={async () => {
            await api("/servers/" + id, "DELETE", {});
            await c.refresh();
            router.push("/servers");
            c.notice("Server removed from workspace. VPS preserved.");
          }}
        />
      )}
      {rename && (
        <Modal title="Edit server" onClose={() => setRename(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                await api("/servers/" + id, "PATCH", {
                  name: f.get("name"),
                  description: f.get("description"),
                });
                await c.refresh();
                setRename(false);
                c.notice("Server updated");
              } catch (e: any) {
                c.notice(e.message, true);
              }
            }}
          >
            <Field label="Server name">
              <input
                name="name"
                defaultValue={s.name}
                minLength={2}
                maxLength={70}
                required
              />
            </Field>
            <Field label="Description">
              <input
                name="description"
                defaultValue={s.description}
                maxLength={500}
              />
            </Field>
            <Notice info>
              Connection identity is immutable. To change SSH endpoint or
              credentials, create a new verified connection.
            </Notice>
            <div className="form-actions">
              <button className="btn primary">Save changes</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function InstallationCenter() {
  return (
    <>
      <Heading
        title="Installation Center"
        description="Real installations. Persistent jobs. Every step, verified."
      />
      <InstallCards />
      <div className="feature-grid">
        {[
          {
            title: "Configure existing Panel",
            text: "Preserve APP_KEY, databases, and working services. Begin with an inspection.",
            icon: Layers,
            href: "/diagnostics",
          },
          {
            title: "Configure existing Wings",
            text: "Inspect your existing daemon and review changes before replacing configuration.",
            icon: Boxes,
            href: "/install/wings?existing=true",
          },
          {
            title: "Repair & diagnostics",
            text: "Find service, resource, and networking issues using observed evidence.",
            icon: Activity,
            href: "/diagnostics",
          },
        ].map((x) => (
          <Link key={x.title} href={x.href} className="panel feature-card">
            <x.icon size={23} />
            <h2>
              {x.title}
              <ArrowUpRight size={13} style={{ float: "right" }} />
            </h2>
            <p>{x.text}</p>
          </Link>
        ))}
      </div>
      <Notice info>
        Remote changes require a persistent backend with a staging-validated
        installation profile. Closing your browser does not cancel a queued job.
      </Notice>
    </>
  );
}
export function Installer({ kind }: { kind: "panel" | "wings" | "upcloud" }) {
  const c = useWorkspace(),
    router = useRouter();
  const [stage, setStage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [config, setConfig] = useState<any>(null);
  const wing = kind !== "panel",
    upcloud = kind === "upcloud";
  const [connection, setConnection] = useState<any>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const stages =
    kind === "panel"
      ? [
          "VPS",
          "Compatibility",
          "Domain",
          "Database",
          "Redis",
          "PHP",
          "Web server",
          "SSL",
          "Administrator",
          "Review",
          "Installation",
          "Verification",
        ]
      : [
          "VPS",
          "Compatibility",
          "Panel & node",
          "Configuration",
          "TLS & networking",
          "Review",
          "Installation",
          "Verification",
        ];
  const [index, setIndex] = useState(0);
  const [profile, setProfile] = useState("ubuntu-24.04");
  const existing =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("existing");
  const title = upcloud
    ? "UpCloud Special Setup"
    : `Install ${wing ? "Pterodactyl Wings" : "Pterodactyl Panel"}`;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c.requireAuth()) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setConfig(f);
    setStage(1);
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const options = wing
        ? {
            domain: config.domain,
            panel_url: config.panel_url.replace(/\/$/, "") + "/",
            node_id: Number(config.node_id),
            email: config.email,
            yaml: config.yaml,
            proxy: config.proxy === "on",
            consent: true,
            os_profile: config.os_profile,
          }
        : {
            domain: config.domain,
            email: config.email,
            admin_name: config.admin_name,
            admin_password: config.admin_password,
            ssl: true,
            consent: true,
            os_profile: config.os_profile,
          };
      await api("/jobs", "POST", {
        connection: { server: connection.server, test_id: connection.test_id },
        type: upcloud
          ? "upcloud_setup"
          : wing
            ? existing
              ? "configure_wings"
              : "install_wings"
            : "install_panel",
        config: options,
        confirmed: true,
        idempotency_key: requestId,
      });
      setConnection(null);
      setConfig(null);
      await c.refresh();
      c.notice(
        "Installation queued. The worker continues even if this tab closes.",
      );
      router.push("/history");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!connection)
    return (
      <InstallationConnection
        upcloud={upcloud}
        onReady={(value) => {
          setConnection(value);
          const detected = detectedProfile(value.evidence);
          if (detected) setProfile(detected);
        }}
      />
    );
  return (
    <>
      <Heading
        title={title}
        description={
          upcloud
            ? "A separate workflow for UpCloud network, TLS, proxy and SFTP configuration."
            : "An explicit configuration. A persistent job. Service-level verification."
        }
      />
      <div className="split-layout">
        <div>
          <div className="stepper">
            {stages.map((s, i) => (
              <span
                key={s}
                className={
                  stage === 0
                    ? i === 0
                      ? "current"
                      : ""
                    : i === stages.indexOf("Review")
                      ? "current"
                      : ""
                }
                style={{ flex: "initial", padding: "9px 10px" }}
              >
                {String(i + 1).padStart(2, "0")} {s}
              </span>
            ))}
          </div>
          <div className="panel pad">
            {stage === 0 ? (
              <form onSubmit={submit}>
                <div className="form-intro">
                  <h2>
                    {wing
                      ? "Connect your node to a Panel"
                      : "Configure your new Panel"}
                  </h2>
                  <p>
                    {wing
                      ? "Use the official YAML from Admin → Nodes → Configuration. Never paste deployment commands."
                      : "Choose a separate Ubuntu 22.04 or 24.04 profile for a fresh VPS. Existing services are preserved by refusing fresh installation."}
                  </p>
                </div>
                <Notice info>
                  Target: {connection.server.host}:{connection.server.port}.
                  Connection credentials are removed from the backend when this
                  job ends.
                </Notice>
                <Field
                  label="Installation OS profile"
                  hint="The worker checks the actual VPS OS before changing packages. A mismatch stops installation."
                >
                  <select
                    name="os_profile"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    required
                  >
                    {installationProfiles.map((p) => (
                      <option key={p} value={p}>
                        {profileLabel(p)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Notice info>
                  {wing
                    ? `${profile === "ubuntu-22.04" ? "Ubuntu 22.04" : "Ubuntu 24.04"} Wings profile: Docker Engine must already be installed. No PHP repository changes are made.`
                    : profile === "ubuntu-22.04"
                      ? "Ubuntu 22.04: adds the Ondřej PHP PPA documented by Pterodactyl, then installs PHP 8.3. This adds a third-party package source. PHP 8.1 is not used for Panel."
                      : "Ubuntu 24.04: installs PHP 8.3 from the configured Ubuntu repositories. The Ubuntu 22.04 PHP PPA is not added."}
                </Notice>
                <div className="form-grid">
                  <Field label={wing ? "Node FQDN" : "Panel domain"}>
                    <input
                      name="domain"
                      placeholder={
                        wing ? "node.example.com" : "panel.example.com"
                      }
                      required
                    />
                  </Field>
                  <Field label="Certificate contact email">
                    <input
                      name="email"
                      type="email"
                      placeholder="admin@example.com"
                      required
                    />
                  </Field>
                  {wing ? (
                    <>
                      <Field label="Panel URL">
                        <input
                          name="panel_url"
                          type="url"
                          placeholder="https://panel.example.com"
                          required
                        />
                      </Field>
                      <Field label="Node ID">
                        <input
                          name="node_id"
                          type="number"
                          min={1}
                          required
                          placeholder="1"
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Administrator username">
                        <input
                          name="admin_name"
                          required
                          minLength={3}
                          maxLength={32}
                          pattern="[a-zA-Z0-9_-]+"
                          placeholder="admin"
                        />
                      </Field>
                      <Field label="Administrator password">
                        <input
                          name="admin_password"
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                          placeholder="At least 12 characters"
                        />
                      </Field>
                    </>
                  )}
                </div>
                {wing && (
                  <>
                    <Field
                      label="Official Wings YAML configuration"
                      hint="Contains a sensitive daemon token. Stored encrypted only for the job, then removed from the active job record."
                    >
                      <textarea
                        name="yaml"
                        placeholder={
                          "uuid: …\ntoken_id: …\ntoken: …\napi:\n  port: 8080\nremote: https://panel.example.com"
                        }
                        required
                        minLength={30}
                        maxLength={32768}
                        style={{ minHeight: 190 }}
                      />
                    </Field>
                    <label className="checkbox">
                      <input name="proxy" type="checkbox" />
                      Use Nginx HTTPS reverse proxy (443 → verified HTTPS
                      loopback). SFTP remains separate.
                    </label>
                  </>
                )}
                <Notice>
                  {wing
                    ? "Docker must already be installed from an official signed repository. Existing Wings/TLS configurations will not be overwritten."
                    : "Dependencies include patched PHP 8.3, Composer 2, MariaDB, Redis and Nginx. All A/AAAA records must point to addresses assigned to this VPS."}
                </Notice>
                <div className="form-actions">
                  <button className="btn primary">
                    Review configuration
                    <ArrowRight />
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="form-intro">
                  <h2>Review before making changes</h2>
                  <p>
                    The worker checks compatibility and conflicts before
                    applying this fixed installation profile.
                  </p>
                </div>
                <div className="evidence-grid">
                  {Object.entries({
                    Server: connection.server.host,
                    Domain: config.domain,
                    Version: wing ? "Wings 1.13.4" : "Panel 1.15.2",
                    OS: profileLabel(config.os_profile),
                    "PHP source": wing
                      ? "Not required for Wings"
                      : config.os_profile === "ubuntu-22.04"
                        ? "Ondřej PHP PPA · PHP 8.3"
                        : "Ubuntu repositories · PHP 8.3",
                    TLS: "Required · Let’s Encrypt",
                    Mode:
                      config.proxy === "on"
                        ? "HTTPS reverse proxy"
                        : "Direct HTTPS",
                  }).map(([k, v]) => (
                    <div className="evidence-box" key={k}>
                      <small>{k}</small>
                      <strong>{String(v)}</strong>
                    </div>
                  ))}
                </div>
                <Notice>
                  Installing packages, creating services and issuing TLS
                  certificates changes the target VPS. Keep recovery console
                  access available. Existing application or certificate
                  conflicts stop this profile.
                </Notice>
                {wing && (
                  <Notice info>
                    Service/API verification does not prove Panel-to-Wings
                    access. The job will explicitly report incomplete
                    verification when Panel-side evidence is unavailable.
                  </Notice>
                )}
                {!c.health?.installers_enabled && (
                  <Notice>
                    Remote changes are currently disabled. The operator must
                    validate this profile on disposable staging VPSs before
                    enabling installers.
                  </Notice>
                )}
                <label className="checkbox">
                  <input
                    id="install-consent"
                    type="checkbox"
                    onChange={(e) => setIndex(e.target.checked ? 1 : 0)}
                  />
                  I own or administer this VPS and approve the listed package,
                  service and TLS changes.
                </label>
                {error && <div className="inline-error">{error}</div>}
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setStage(0);
                      setConfig(null);
                      setIndex(0);
                    }}
                  >
                    Back to configuration
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy || !index}
                    onClick={start}
                  >
                    <Busy busy={busy}>
                      <Play />
                      Confirm & queue installation
                    </Busy>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <aside className="panel pad side-info">
          <div className="install-icon blue">
            {wing ? <Boxes /> : <Layers />}
          </div>
          <h2 style={{ marginTop: 20 }}>What happens next?</h2>
          <ul>
            <li>SSH host identity is checked against the saved fingerprint.</li>
            <li>OS, resources, DNS and conflicts are inspected.</li>
            <li>Only fixed, reviewed commands are executed.</li>
            <li>Progress follows real stages, not a timer.</li>
            <li>Services and network paths are verified.</li>
          </ul>
          <DocsLink topic={wing ? 12 : 8}>Read the installation guide</DocsLink>
          {upcloud && (
            <p>
              Check both the local firewall and external rules in the UpCloud
              console. SFTP and game traffic do not pass through an HTTP proxy.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
export function History({ filter }: { filter?: string }) {
  const c = useWorkspace();
  const jobs = c.jobs.filter((j) => !filter || j.server_id === filter);
  return (
    <>
      {!filter && (
        <Heading
          title="Installation history"
          description="Every job, every stage, and the evidence behind its result."
        >
          <button className="btn" onClick={() => c.refresh()}>
            <RefreshCw />
            Refresh
          </button>
        </Heading>
      )}
      {jobs.length ? (
        jobs.map((j) => (
          <div className="panel job-card" key={j.id}>
            <div className="job-card-head">
              <div className="job-title">
                <div className="stat-icon">
                  <Terminal />
                </div>
                <div>
                  <strong>{j.type.replaceAll("_", " ")}</strong>
                  <small>
                    {j.server_name} · {relative(j.created_at)} ·{" "}
                    {j.id.slice(0, 8)}
                  </small>
                </div>
              </div>
              <Badge status={j.status} />
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: j.progress + "%",
                  background: j.status === "Failed" ? "#be7488" : undefined,
                }}
              />
            </div>
            <div className="job-step">
              <span>{j.step}</span>
              <span>{j.progress}%</span>
            </div>
            {j.connection_removed && (
              <Notice info>
                Temporary VPS connection and credentials deleted. Enter new
                connection details for another installation.
              </Notice>
            )}
            {j.error && <div className="inline-error">{j.error}</div>}
            <details>
              <summary>View stage logs & verification evidence</summary>
              <pre className="log-output">
                {j.logs.length
                  ? j.logs
                      .map(
                        (l: any) =>
                          `[${new Date(l.at).toLocaleTimeString()}] ${l.message}`,
                      )
                      .join("\n")
                  : "Waiting for the worker to start…"}
              </pre>
              {j.result && (
                <pre className="log-output">
                  {JSON.stringify(j.result, null, 2)}
                </pre>
              )}
            </details>
            <div style={{ display: "flex", gap: 12, marginTop: 17 }}>
              {!j.temporary &&
                ["Failed", "Cancelled", "Completed"].includes(j.status) &&
                ["diagnostics", "firewall_check", "ssl_check"].includes(
                  j.type,
                ) && (
                  <button
                    className="btn small"
                    onClick={async () => {
                      try {
                        await api("/jobs/" + j.id + "/retry", "POST", {});
                        await c.refresh();
                        c.notice("Read-only check queued again");
                      } catch (e: any) {
                        c.notice(e.message, true);
                      }
                    }}
                  >
                    <RefreshCw />
                    Retry check
                  </button>
                )}
              {!["Completed", "Failed", "Cancelled"].includes(j.status) && (
                <button
                  className="btn small"
                  onClick={async () => {
                    try {
                      const r = await api(
                        "/jobs/" + j.id + "/cancel",
                        "POST",
                        {},
                      );
                      c.notice(r.message);
                      await c.refresh();
                    } catch (e: any) {
                      c.notice(e.message, true);
                    }
                  }}
                >
                  {j.cancel_requested
                    ? "Cancellation requested"
                    : "Request cancellation"}
                </button>
              )}
              {!j.temporary && ["Failed", "Completed"].includes(j.status) && (
                <Link
                  href={"/diagnostics?server=" + j.server_id}
                  className="text-link"
                >
                  Recheck server
                  <ArrowRight size={12} />
                </Link>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="panel">
          <Empty
            large
            title="Your deployment story starts here"
            description="Installations and diagnostic jobs appear here as they run. Progress and logs are saved even when your browser closes."
            icon={<Clock />}
          >
            <Link className="btn primary" href="/installation-center">
              <Play />
              Open Installation Center
            </Link>
          </Empty>
        </div>
      )}
    </>
  );
}
export function Diagnostics({ firewall = false }: { firewall?: boolean }) {
  const c = useWorkspace(),
    router = useRouter(),
    params = useSearchParams();
  const [server, setServer] = useState(params.get("server") || ""),
    [busy, setBusy] = useState(false);
  const [repair, setRepair] = useState(false);
  const s = c.servers.find((s) => s.id === server),
    result = s?.latest_diagnostics;
  async function run() {
    if (!c.requireAuth()) return;
    setBusy(true);
    try {
      await api("/jobs", "POST", {
        server_id: server,
        type: firewall ? "firewall_check" : "diagnostics",
        config: {},
        idempotency_key: crypto.randomUUID(),
      });
      await c.refresh();
      c.notice("Diagnostic job queued on the persistent worker.");
      router.push("/history");
    } catch (e: any) {
      c.notice(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={firewall ? "Firewall Checker" : "Diagnostics Center"}
        description={
          firewall
            ? "Inspect host rules and listening ports. Keep external firewall facts separate."
            : "Understand your server with observed evidence, not guesses."
        }
      >
        {!firewall && server && (
          <button className="btn" onClick={() => setRepair(true)}>
            <Settings />
            Service repair
          </button>
        )}
      </Heading>
      {repair && (
        <OperationDialog
          operation={{ type: "repair_service", server_id: server }}
          onClose={() => setRepair(false)}
        />
      )}
      <div className="panel pad" style={{ marginBottom: 22 }}>
        <div
          className="form-grid"
          style={{ gridTemplateColumns: "1fr auto", alignItems: "end" }}
        >
          <Field label="Target VPS">
            <select value={server} onChange={(e) => setServer(e.target.value)}>
              <option value="">Select a connected VPS</option>
              {c.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.host}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn primary"
            style={{ marginBottom: 18 }}
            disabled={!server || busy}
            onClick={run}
          >
            <Busy busy={busy}>
              <Activity />
              Run {firewall ? "firewall check" : "diagnostics"}
            </Busy>
          </button>
        </div>
        <Notice info>
          {firewall
            ? "Checks are read-only. No ports are opened, no firewall is disabled, and SSH rules are preserved. External provider rules require console/API evidence."
            : "Checks run over the pinned SSH connection. Services, OS, CPU, memory, disk, listening ports and local firewall state are inspected."}
        </Notice>
      </div>
      {result?.checks?.length ? (
        <div className="panel">
          <div className="panel-header">
            <h2>Last observed evidence</h2>
            <span className="pill">{relative(s.last_verified_at)}</span>
          </div>
          {result.checks
            .filter(
              (x: any) =>
                !firewall ||
                [
                  "ufw",
                  "nft",
                  "iptables",
                  "listening_ports",
                  "provider_firewall",
                ].includes(x.name),
            )
            .map((x: any) => (
              <div className="check-result" key={x.name}>
                <div className="check-result-head">
                  <strong style={{ fontWeight: 500 }}>{x.name}</strong>
                  <Badge status={x.status} />
                </div>
                <p>{x.explanation}</p>
                {x.status !== "pass" && (
                  <DocsLink topic={firewall ? 16 : 17}>
                    Recommended troubleshooting steps
                  </DocsLink>
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            large
            title="Evidence before action"
            description="Select a server and run a read-only check. Results include observation time and unknown states instead of assumed causes."
            icon={firewall ? <ShieldCheck /> : <Activity />}
          />
        </div>
      )}
    </>
  );
}
export function Nodes() {
  const c = useWorkspace();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remove, setRemove] = useState<any>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/nodes", "POST", {
        ...f,
        node_id: Number(f.node_id),
        daemon_port: Number(f.daemon_port),
        sftp_port: Number(f.sftp_port),
      });
      await c.refresh();
      setOpen(false);
      c.notice(
        "Node connected as unverified. Run diagnostics to inspect the daemon.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Node Manager"
        description="Your Panel connections, daemon endpoints, and node verification."
      >
        <button
          className="btn primary"
          onClick={() => c.requireAuth() && setOpen(true)}
        >
          <Plus />
          Connect existing node
        </button>
      </Heading>
      {c.nodes.length ? (
        <div className="keys-grid">
          {c.nodes.map((n) => (
            <div className="panel key-card" key={n.id}>
              <div className="key-card-head">
                <div className="install-icon blue">
                  <Network />
                </div>
                <Badge status={n.status} />
              </div>
              <h2>{n.name}</h2>
              <p>{n.fqdn}</p>
              <div className="status-line">
                <span>Node ID</span>
                <span>#{n.node_id}</span>
              </div>
              <div className="status-line">
                <span>Daemon / SFTP</span>
                <span>
                  {n.daemon_port} / {n.sftp_port}
                </span>
              </div>
              <div className="status-line">
                <span>Last verification</span>
                <span>
                  {n.last_verified_at
                    ? relative(n.last_verified_at)
                    : "Not verified"}
                </span>
              </div>
              <div className="key-card-actions">
                <Link
                  className="btn small"
                  href={"/diagnostics?server=" + n.server_id}
                >
                  <Activity />
                  Diagnostics
                </Link>
                <Link href="/install/wings?existing=true" className="btn small">
                  <Settings />
                  Configure
                </Link>
                <button
                  aria-label="Disconnect node"
                  className="icon-btn"
                  onClick={() => setRemove(n)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <a
                className="text-link"
                href={n.panel_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: 20 }}
              >
                Open Panel
                <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            large
            title="Give your infrastructure wings"
            description="Connect a node from an existing Pterodactyl Panel. Keep its identity, endpoints, and verification history in one place."
            icon={<Network />}
          >
            <button
              className="btn primary"
              onClick={() => c.requireAuth() && setOpen(true)}
            >
              <Plus />
              Connect a node
            </button>
          </Empty>
        </div>
      )}
      <div style={{ marginTop: 23 }}>
        <DocsLink topic={9}>How do I create a node in Pterodactyl?</DocsLink>
      </div>
      {open && (
        <Modal title="Connect an existing node" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            <Field label="Node name">
              <input
                name="name"
                placeholder="EU production node"
                required
                minLength={2}
              />
            </Field>
            <Field label="Target VPS">
              <select name="server_id" required>
                <option value="">Select a server</option>
                {c.servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Panel URL">
                <input
                  name="panel_url"
                  type="url"
                  placeholder="https://panel.example.com"
                  required
                />
              </Field>
              <Field label="Node ID">
                <input
                  name="node_id"
                  type="number"
                  min={1}
                  placeholder="1"
                  required
                />
              </Field>
              <Field label="Node FQDN">
                <input name="fqdn" placeholder="node.example.com" required />
              </Field>
              <Field label="Daemon port">
                <input
                  name="daemon_port"
                  type="number"
                  defaultValue={8080}
                  min={1}
                  max={65535}
                  required
                />
              </Field>
              <Field label="SFTP port">
                <input
                  name="sftp_port"
                  type="number"
                  defaultValue={2022}
                  min={1}
                  max={65535}
                  required
                />
              </Field>
            </div>
            <Notice info>
              Adding metadata does not verify node reachability. Configuration
              tokens are different in purpose from optional Panel API
              integrations; review your Panel version’s permissions.
            </Notice>
            {error && <div className="inline-error">{error}</div>}
            <div className="form-actions">
              <button className="btn primary" disabled={busy}>
                <Busy busy={busy}>Connect node</Busy>
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Confirm
          title="Disconnect node?"
          description="This removes the workspace record. It does not delete the node from your Panel or stop Wings."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api("/nodes/" + remove.id, "DELETE", {});
            await c.refresh();
            c.notice("Node disconnected from workspace");
          }}
        />
      )}
    </>
  );
}
export function SSL() {
  const c = useWorkspace();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(""),
    [error, setError] = useState(""),
    [remove, setRemove] = useState<any>(null),
    [operation, setOperation] = useState<any>(null);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        "/domains",
        "POST",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await c.refresh();
      setOpen(false);
      c.notice("Domain added with live DNS evidence");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="SSL Manager"
        description="Know your domains, validate DNS, and inspect live TLS certificates."
      >
        <button
          className="btn primary"
          onClick={() => c.requireAuth() && setOpen(true)}
        >
          <Plus />
          Add domain
        </button>
      </Heading>
      <Notice info>
        Verification is read-only and checks the live certificate’s trust chain,
        hostname, and expiry. Existing TLS configurations are preserved.
      </Notice>
      {c.domains.length ? (
        <div className="keys-grid" style={{ marginTop: 22 }}>
          {c.domains.map((d) => (
            <div className="panel key-card" key={d.id}>
              <div className="key-card-head">
                <div className="install-icon green">
                  <Globe />
                </div>
                <Badge status={d.dns_status} />
              </div>
              <h2>{d.fqdn}</h2>
              <p>
                {c.servers.find((s) => s.id === d.server_id)?.name ||
                  "Server removed"}
              </p>
              <div className="status-line">
                <span>DNS addresses</span>
                <span style={{ maxWidth: 140, overflowWrap: "anywhere" }}>
                  {d.addresses.join(", ") || "No records"}
                </span>
              </div>
              <div className="status-line">
                <span>TLS expiry</span>
                <span>
                  {d.certificate
                    ? new Date(d.certificate.valid_to).toLocaleDateString()
                    : "Not inspected"}
                </span>
              </div>
              <div className="status-line">
                <span>Certificate issuer</span>
                <span>{d.certificate?.issuer || "Unknown"}</span>
              </div>
              <div className="key-card-actions">
                <button
                  className="btn small"
                  disabled={checking === d.id}
                  onClick={async () => {
                    setChecking(d.id);
                    try {
                      await api("/domains/" + d.id + "/verify", "POST", {});
                      await c.refresh();
                      c.notice("TLS chain, hostname and expiry verified");
                    } catch (e: any) {
                      c.notice(e.message, true);
                    } finally {
                      setChecking("");
                    }
                  }}
                >
                  <Busy busy={checking === d.id}>
                    <ShieldCheck />
                    Verify TLS
                  </Busy>
                </button>
                <button
                  className="btn small"
                  onClick={() =>
                    setOperation({
                      type: "certificate_issue",
                      domain: d.fqdn,
                      server_id: d.server_id,
                    })
                  }
                >
                  <Plus />
                  Issue
                </button>
                <button
                  className="btn small"
                  onClick={() =>
                    setOperation({
                      type: "certificate_renew",
                      domain: d.fqdn,
                      server_id: d.server_id,
                    })
                  }
                >
                  <RefreshCw />
                  Renew
                </button>
                <button
                  className="icon-btn"
                  aria-label="Remove domain"
                  onClick={() => setRemove(d)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ marginTop: 18 }}>
                <DocsLink topic={15}>Issuance & renewal prerequisites</DocsLink>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            large
            title="Confidence in every certificate"
            description="Add a domain associated with a connected VPS, inspect its DNS, and verify HTTPS without changing an existing certificate."
            icon={<Globe />}
          >
            <button
              className="btn primary"
              onClick={() => c.requireAuth() && setOpen(true)}
            >
              <Plus />
              Add your first domain
            </button>
          </Empty>
        </div>
      )}
      {open && (
        <Modal title="Add a domain" onClose={() => setOpen(false)}>
          <form onSubmit={add}>
            <Field label="Domain or subdomain">
              <input name="fqdn" placeholder="panel.example.com" required />
            </Field>
            <Field label="Target VPS">
              <select name="server_id" required>
                <option value="">Select a server</option>
                {c.servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.host}
                  </option>
                ))}
              </select>
            </Field>
            <Notice info>
              All DNS records are compared with the selected server. Issuance
              requires correct routing and reachable challenge ports.
            </Notice>
            {error && <div className="inline-error">{error}</div>}
            <div className="form-actions">
              <button className="btn primary" disabled={busy}>
                <Busy busy={busy}>Add & check DNS</Busy>
              </button>
            </div>
          </form>
        </Modal>
      )}
      {operation && (
        <OperationDialog
          operation={operation}
          onClose={() => setOperation(null)}
        />
      )}
      {remove && (
        <Confirm
          title="Remove domain from workspace?"
          description="Your DNS records and certificates on the VPS will not be changed."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api("/domains/" + remove.id, "DELETE", {});
            await c.refresh();
          }}
        />
      )}
    </>
  );
}
export function Documentation() {
  const params = useSearchParams();
  const n = Number(params.get("article") || 0);
  const index = Number.isInteger(n) && n >= 0 && n < articles.length ? n : 0;
  const article = articles[index];
  return (
    <>
      <Heading
        title="Documentation"
        description="Straightforward guides. Safe defaults. A little help at every step."
      />
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation topics">
          {articles.map((a, i) => (
            <div key={a.title}>
              {(i === 0 || a.category !== articles[i - 1].category) && (
                <div className="docs-category">{a.category}</div>
              )}
              <Link
                href={"/documentation?article=" + i}
                className={index === i ? "current" : ""}
              >
                {a.title}
              </Link>
            </div>
          ))}
        </nav>
        <article className="panel article">
          <span className="eyebrow">{article.category}</span>
          <h2>{article.title}</h2>
          <p>{article.description}</p>
          <ol>
            {article.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Notice info>
            Use a disposable staging VPS for installation tests. Never send your
            private key, password, or daemon token to support.
          </Notice>
          <div className="form-actions">
            {index > 0 && (
              <Link
                href={"/documentation?article=" + (index - 1)}
                className="btn"
              >
                Previous guide
              </Link>
            )}
            {index < articles.length - 1 && (
              <Link
                href={"/documentation?article=" + (index + 1)}
                className="btn primary"
              >
                Next guide
                <ArrowRight />
              </Link>
            )}
          </div>
          <p style={{ fontSize: 10, marginTop: 24 }}>
            References:{" "}
            <a
              href="https://docs.pterodactyl.io/v1/panel/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Pterodactyl documentation ↗
            </a>{" "}
            · Version assumptions reviewed 10 Nov 2026.
          </p>
        </article>
      </div>
    </>
  );
}
export function Account() {
  const c = useWorkspace(),
    [sessions, setSessions] = useState<any[]>([]),
    [deleteOpen, setDeleteOpen] = useState(false),
    [busy, setBusy] = useState("");
  useEffect(() => {
    if (c.user)
      api("/sessions")
        .then(setSessions)
        .catch(() => {});
  }, [c.user?.id]);
  if (!c.user)
    return (
      <>
        <Heading
          title="Account settings"
          description="Your profile, security preferences, and active sessions."
        />
        <div className="panel">
          <Empty
            large
            title="A workspace that’s yours"
            description="Create an account to manage your servers and keys with per-user data isolation."
            icon={<Lock />}
          >
            <button className="btn primary" onClick={() => c.auth("register")}>
              Create account
              <ArrowRight />
            </button>
            <button className="btn ghost" onClick={() => c.auth()}>
              Sign in
            </button>
          </Empty>
        </div>
      </>
    );
  async function submit(
    e: FormEvent<HTMLFormElement>,
    path: string,
    kind: string,
  ) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(kind);
    try {
      await api(path, path === "/me" ? "PATCH" : "POST", body);
      await c.refresh();
      c.notice(
        kind === "profile"
          ? "Profile updated"
          : "Password changed. Sign in again.",
      );
    } catch (e: any) {
      c.notice(e.message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Heading
        title="Account settings"
        description="Your profile, account security, and active sessions."
      />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <h2>Profile details</h2>
          <form onSubmit={(e) => submit(e, "/me", "profile")}>
            <Field label="Full name">
              <input
                name="name"
                defaultValue={c.user.name}
                required
                minLength={2}
              />
            </Field>
            <Field label="Email address">
              <input value={c.user.email} readOnly />
            </Field>
            <div className="section-heading">
              <Badge
                status={c.user.email_verified ? "verified" : "unverified"}
              />
              {!c.user.email_verified && (
                <button
                  className="text-link"
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await api(
                        "/auth/send-verification",
                        "POST",
                        {},
                      );
                      c.notice(r.message);
                    } catch (e: any) {
                      c.notice(e.message, true);
                    }
                  }}
                >
                  Send verification
                  <Mail size={12} />
                </button>
              )}
            </div>
            <div className="form-actions">
              <button className="btn primary" disabled={busy === "profile"}>
                <Busy busy={busy === "profile"}>Save profile</Busy>
              </button>
            </div>
          </form>
        </section>
        <section className="panel settings-panel">
          <h2>Change password</h2>
          <form onSubmit={(e) => submit(e, "/me/password", "password")}>
            <Field label="Current password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password">
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </Field>
            <p className="modal-description">
              Changing your password signs out all existing sessions.
            </p>
            <div className="form-actions">
              <button className="btn" disabled={busy === "password"}>
                <Busy busy={busy === "password"}>Update password</Busy>
              </button>
            </div>
          </form>
        </section>
        <section className="panel settings-panel">
          <h2>Active sessions</h2>
          {sessions.map((s) => (
            <div className="session-row" key={s.id}>
              <Monitor size={18} />
              <div>
                <strong>
                  {s.current ? "This browser" : "Browser session"}
                </strong>
                <small>Last seen {relative(s.last_seen_at)}</small>
              </div>
              {s.current ? (
                <span className="pill green">CURRENT</span>
              ) : (
                <button
                  className="btn small"
                  onClick={async () => {
                    try {
                      await api("/sessions/" + s.id, "DELETE", {});
                      setSessions(await api("/sessions"));
                      c.notice("Session revoked");
                    } catch (e: any) {
                      c.notice(e.message, true);
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button
              className="btn"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST", {});
                  await c.refresh();
                  c.notice("Signed out securely");
                } catch (e: any) {
                  c.notice(e.message, true);
                }
              }}
            >
              <LogOut />
              Sign out
            </button>
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>Account deletion</h2>
          <p className="modal-description">
            Delete your account, workspace records, sessions, and encrypted
            credentials. Your VPS and installed applications will remain intact.
          </p>
          <Notice>
            Public keys already installed on a VPS must be removed separately.
            Active jobs must finish before deletion.
          </Notice>
          <button className="btn danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Delete account
          </button>
        </section>
      </div>
      {deleteOpen && (
        <PasswordDialog
          title="Permanently delete account"
          description="Confirm your password. This deletes your ZetaInstall account and credentials, but never deletes a VPS."
          onClose={() => setDeleteOpen(false)}
          onSubmit={async (password) => {
            await api("/me", "DELETE", { password });
            await c.refresh();
            c.notice("Account deleted. VPS infrastructure preserved.");
          }}
        />
      )}
    </>
  );
}
export function ActivityLog() {
  const c = useWorkspace();
  return (
    <>
      <Heading
        title="Audit log"
        description="A record of important actions within your account."
      />
      <div className="panel">
        {c.activity.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>EVENT</th>
                  <th>RESOURCE</th>
                  <th>DATE & TIME</th>
                </tr>
              </thead>
              <tbody>
                {c.activity.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>
                        {a.action.replaceAll(".", " · ").replaceAll("_", " ")}
                      </strong>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                      {a.resource_id?.slice(0, 16) || "Account"}
                    </td>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            large
            title="Every important action, accounted for"
            description="Your audit trail starts when you create an account. Secret values are never included."
            icon={<FileText />}
          />
        )}
      </div>
    </>
  );
}
export function AuthPage({ mode }: { mode: string }) {
  const c = useWorkspace(),
    router = useRouter();
  const [current, setCurrent] = useState(mode);
  return (
    <div className="auth-page panel pad">
      <AuthForm
        mode={current}
        onMode={setCurrent}
        onDone={() => router.push("/")}
      />
    </div>
  );
}
export function ResetPage({ verify = false }: { verify?: boolean }) {
  const p = useSearchParams(),
    c = useWorkspace(),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page panel pad">
      <h2 style={{ fontSize: 22 }}>
        {verify ? "Verify your email" : "Choose a new password"}
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              "/auth/" + (verify ? "verify-email" : "reset-password"),
              "POST",
              {
                token: p.get("token"),
                ...Object.fromEntries(new FormData(e.currentTarget)),
              },
            );
            setDone(true);
            await c.refresh();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!verify && (
          <Field label="New password">
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
        )}
        {done ? (
          <div className="inline-success">
            {verify
              ? "Email verified."
              : "Password reset. You can sign in now."}
            <Link href="/login" className="text-link">
              Continue to login
              <ArrowRight size={12} />
            </Link>
          </div>
        ) : (
          <button className="btn primary" disabled={busy}>
            <Busy busy={busy}>
              {verify ? "Confirm email verification" : "Reset password"}
            </Busy>
          </button>
        )}
        {error && <div className="inline-error">{error}</div>}
      </form>
    </div>
  );
}
export function Admin({ section }: { section: string }) {
  const c = useWorkspace(),
    [data, setData] = useState<any>(null),
    [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    if (c.user?.role === "administrator") {
      api("/admin")
        .then(setData)
        .catch((e: any) => c.notice(e.message, true));
      api("/admin/logs")
        .then(setLogs)
        .catch(() => {});
    }
  }, [c.user?.role]);
  if (c.user?.role !== "administrator")
    return (
      <>
        <Heading
          title="Administration"
          description="System operations are restricted to authorized administrators."
        />
        <div className="panel">
          <Empty
            large
            title="Administrator access required"
            description="Your user account cannot access system management or another user’s credentials. Contact the operator for role provisioning."
            icon={<ShieldCheck />}
          >
            <Link className="btn" href="/">
              Return to dashboard
            </Link>
          </Empty>
        </div>
      </>
    );
  return (
    <>
      <Heading
        title={
          section === "users"
            ? "User Management"
            : section === "workers"
              ? "Worker Status"
              : section === "queue"
                ? "Job Queue"
                : section === "logs"
                  ? "System Logs"
                  : section === "errors"
                    ? "Error Monitoring"
                    : section === "settings"
                      ? "Application Settings"
                      : "System Overview"
        }
        description="System metadata only. Private keys and user credentials are excluded."
      />
      <nav className="tabs" aria-label="Administration">
        {[
          "system",
          "users",
          "workers",
          "queue",
          "logs",
          "errors",
          "settings",
        ].map((item) => (
          <Link
            className={"tab " + (section === item ? "active" : "")}
            key={item}
            href={"/admin/" + item}
          >
            {
              (
                {
                  system: "Overview",
                  users: "Users",
                  workers: "Workers",
                  queue: "Job queue",
                  logs: "System logs",
                  errors: "Errors",
                  settings: "Settings",
                } as any
              )[item]
            }
          </Link>
        ))}
      </nav>
      <div className="panel pad">
        <div className="evidence-grid">
          {Object.entries({
            Users: data?.users.length || 0,
            Jobs: data?.jobs.length || 0,
            Worker: data?.worker || "checking",
            "Storage revision": data?.revision || 0,
            "Installers enabled": c.health?.installers_enabled ? "Yes" : "No",
            "Email configured": c.health?.email ? "Yes" : "No",
          }).map(([k, v]) => (
            <div className="evidence-box" key={k}>
              <small>{k}</small>
              <strong>{String(v)}</strong>
            </div>
          ))}
        </div>
        {section === "users" &&
          data?.users.map((u: any) => (
            <div className="session-row" key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <small>
                  {u.email} · {u.role}
                </small>
              </div>
              <Badge status={u.status} />
              {u.id !== c.user.id && (
                <button
                  className="btn small"
                  onClick={async () => {
                    try {
                      await api("/admin/users/" + u.id, "PATCH", {
                        status:
                          u.status === "suspended" ? "active" : "suspended",
                      });
                      setData(await api("/admin"));
                      c.notice("Account status updated");
                    } catch (e: any) {
                      c.notice(e.message, true);
                    }
                  }}
                >
                  {u.status === "suspended" ? "Activate" : "Suspend"}
                </button>
              )}
            </div>
          ))}
        {["queue", "errors", "system"].includes(section) &&
          data?.jobs
            .filter((j: any) => section !== "errors" || j.status === "Failed")
            .map((j: any) => (
              <div className="session-row" key={j.id}>
                <div>
                  <strong>
                    {j.type} · {j.server_name}
                  </strong>
                  <small>{j.step}</small>
                </div>
                <Badge status={j.status} />
              </div>
            ))}
        {section === "logs" &&
          logs.map((l) => (
            <div className="session-row" key={l.id}>
              <div>
                <strong>{l.action}</strong>
                <small>
                  {new Date(l.created_at).toLocaleString()} · actor{" "}
                  {l.user_id.slice(0, 8)}
                </small>
              </div>
            </div>
          ))}
        {section === "settings" && (
          <form
            key={JSON.stringify(data?.settings)}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/admin/settings", "PATCH", {
                  maintenance: f.get("maintenance") === "on",
                  registration_enabled: f.get("registration_enabled") === "on",
                });
                setData(await api("/admin"));
                c.notice("Application settings updated");
              } catch (e: any) {
                c.notice(e.message, true);
              }
            }}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                name="maintenance"
                defaultChecked={data?.settings?.maintenance}
              />
              Pause new jobs for maintenance. Existing jobs continue safely.
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="registration_enabled"
                defaultChecked={data?.settings?.registration_enabled !== false}
              />
              Allow new account registrations.
            </label>
            <Notice info>
              Secret keys, email transport, allowed origins, storage paths and
              installer enablement remain operator-managed environment settings.
            </Notice>
            <button className="btn primary">Save application settings</button>
          </form>
        )}
        {section === "workers" && (
          <Notice info>
            The worker claims one durable job at a time and sends a heartbeat
            every 5 seconds while active. A stale job is failed with recovery
            required rather than blindly requeued.
          </Notice>
        )}
      </div>
    </>
  );
}
export function Features() {
  return (
    <>
      <Heading
        title="Built around your infrastructure"
        description="Your VPS. Your Infrastructure. Installed Automatically."
      >
        <Link className="btn primary" href="/register">
          Create workspace
          <ArrowRight />
        </Link>
      </Heading>
      <InstallCards />
      <div className="feature-grid">
        {[
          {
            title: "Any VPS provider",
            text: "SSH-first connections across UpCloud, AWS, DigitalOcean, Vultr, Hetzner and custom providers.",
            icon: Cloud,
            href: "/installation-center",
          },
          {
            title: "Encrypted SSH vault",
            text: "Ed25519 and RSA 4096 generation, public key sharing, and owner-only private key exports.",
            icon: KeyRound,
            href: "/ssh-keys",
          },
          {
            title: "Durable job engine",
            text: "Installation progress and history survive a closed browser. Unsafe retries require reconciliation.",
            icon: Activity,
            href: "/history",
          },
          {
            title: "Evidence-driven diagnostics",
            text: "Inspect Linux services, resources and firewalls. Unknown facts are shown clearly.",
            icon: ShieldCheck,
            href: "/diagnostics",
          },
          {
            title: "Domain and TLS inspection",
            text: "Compare DNS with your VPS, check certificate chains, hostname and expiry.",
            icon: Globe,
            href: "/ssl",
          },
          {
            title: "Guidance when you need it",
            text: "Twenty practical guides covering SSH access, Panel, Wings, DNS, TLS and recovery.",
            icon: FileText,
            href: "/documentation",
          },
        ].map((x) => (
          <Link key={x.title} href={x.href} className="panel feature-card">
            <x.icon size={25} />
            <h2>
              {x.title}
              <ArrowUpRight size={14} style={{ float: "right" }} />
            </h2>
            <p>{x.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
function OperationDialog({
  operation,
  onClose,
}: {
  operation: any;
  onClose: () => void;
}) {
  const c = useWorkspace(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const repair = operation.type === "repair_service";
  return (
    <Modal
      title={
        repair
          ? "Review service repair"
          : operation.type === "certificate_issue"
            ? "Review certificate issuance"
            : "Review certificate renewal"
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const config = repair
              ? {
                  service: data.service,
                  operation: data.operation,
                  consent: true,
                }
              : { domain: operation.domain, email: data.email, consent: true };
            await api("/jobs", "POST", {
              server_id: operation.server_id,
              type: operation.type,
              config,
              confirmed: true,
              idempotency_key: crypto.randomUUID(),
            });
            await c.refresh();
            onClose();
            router.push("/history");
            c.notice("Approved operation queued on the persistent worker.");
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="modal-description">
          {repair
            ? "Only an allowlisted systemd service action will be executed. Check connectivity again after the service state is verified."
            : `Domain: ${operation.domain}. Existing certificates are preserved on issuance. Certbot renewal only acts when due and uses the existing renewal configuration.`}
        </p>
        {repair ? (
          <>
            <Field label="Service">
              <select name="service">
                {[
                  "nginx",
                  "php8.3-fpm",
                  "mariadb",
                  "redis-server",
                  "wings",
                  "pteroq",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Action">
              <select name="operation">
                <option value="start">Start service</option>
                <option value="restart">Restart service</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Certificate contact email">
            <input
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
            />
          </Field>
        )}
        <Notice>
          {repair
            ? "Restarting a service can interrupt your applications. Keep SSH/recovery access available. No configuration files are automatically rewritten."
            : "DNS, port reachability and existing ACME configuration must be correct. A newly issued certificate still requires service configuration and a live endpoint check."}
        </Notice>
        <label className="checkbox">
          <input type="checkbox" required />I approve this remote change on my
          VPS and understand the impact.
        </label>
        {error && <div className="inline-error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            <Busy busy={busy}>Approve & queue</Busy>
          </button>
        </div>
      </form>
    </Modal>
  );
}
