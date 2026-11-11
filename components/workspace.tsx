"use client";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Zap,
  KeyRound,
  Network,
  Globe,
  ShieldCheck,
  Activity,
  History,
  BookOpen,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Command,
  Menu,
  X,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
  Cloud,
  FileText,
  Users,
  Layers,
  Terminal,
  LogIn,
} from "lucide-react";
import { Provider, useWorkspace } from "./context";
import { Logo, Modal } from "./ui";
import { AuthForm } from "./forms";
import Dashboard from "./dashboard";
import {
  Keys,
  Servers,
  ServerDetail,
  InstallationCenter,
  Installer,
  History as JobHistory,
  Diagnostics,
  Nodes,
  SSL,
  Documentation,
  Account,
  ActivityLog,
  AuthPage,
  ResetPage,
  Admin,
  Features,
} from "./views";
import { articles } from "@/lib/docs";
const nav = [
  {
    group: "WORKSPACE",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Saved servers (legacy)", href: "/servers", icon: Server },
      { label: "Installation Center", href: "/installation-center", icon: Zap },
      { label: "SSH Key Manager", href: "/ssh-keys", icon: KeyRound },
      { label: "Node Manager", href: "/nodes", icon: Network },
    ],
  },
  {
    group: "MONITOR & MANAGE",
    items: [
      { label: "SSL Manager", href: "/ssl", icon: Globe },
      { label: "Firewall Checker", href: "/firewall", icon: ShieldCheck },
      { label: "Diagnostics Center", href: "/diagnostics", icon: Activity },
      { label: "Installation History", href: "/history", icon: History },
    ],
  },
];
const labels = Object.fromEntries(
  nav.flatMap((g) => g.items).map((x) => [x.href, x.label]),
);
function Content() {
  const path = usePathname();
  if (path === "/") return <Dashboard />;
  if (path === "/servers/add") return <InstallationCenter />;
  if (path.startsWith("/servers/"))
    return <ServerDetail id={path.split("/")[2]} />;
  if (path === "/servers") return <Servers />;
  if (path === "/ssh-keys") return <Keys />;
  if (path === "/installation-center") return <InstallationCenter />;
  if (path === "/install/panel") return <Installer key={path} kind="panel" />;
  if (path === "/install/wings") return <Installer key={path} kind="wings" />;
  if (path === "/upcloud") return <Installer key={path} kind="upcloud" />;
  if (path === "/nodes") return <Nodes />;
  if (path === "/ssl") return <SSL />;
  if (path === "/firewall") return <Diagnostics firewall />;
  if (path === "/diagnostics") return <Diagnostics />;
  if (path === "/history") return <JobHistory />;
  if (path === "/documentation") return <Documentation />;
  if (path === "/settings") return <Account />;
  if (path === "/activity") return <ActivityLog />;
  if (path === "/features") return <Features />;
  if (path === "/login" || path === "/register" || path === "/forgot-password")
    return (
      <AuthPage
        key={path}
        mode={
          path === "/register"
            ? "register"
            : path === "/forgot-password"
              ? "forgot"
              : "login"
        }
      />
    );
  if (path === "/reset-password" || path === "/verify-email")
    return <ResetPage verify={path === "/verify-email"} />;
  if (path.startsWith("/admin"))
    return <Admin section={path.split("/")[2] || "system"} />;
  return (
    <div className="panel empty-state large-empty">
      <h2>Page not found</h2>
      <p>This workspace page doesn’t exist.</p>
      <Link href="/" className="btn">
        Back to dashboard
      </Link>
    </div>
  );
}
function Shell() {
  const c = useWorkspace(),
    path = usePathname();
  const [narrow, setNarrow] = useState(false);
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [notifications, setNotifications] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setMobile(false);
    setSearch(false);
    setNotifications(false);
  }, [path]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const title =
    labels[path] ||
    (
      {
        "/installation-center": "Install directly",
        "/documentation": "Documentation",
        "/settings": "Account Settings",
        "/activity": "Audit Log",
        "/upcloud": "UpCloud Special Setup",
        "/install/panel": "Install Panel",
        "/install/wings": "Install Wings",
        "/features": "Features",
      } as any
    )[path] ||
    "Workspace";
  return (
    <div className="shell">
      {narrow && mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        inert={narrow && !mobile}
        className={"sidebar " + (mobile ? "open" : "")}
      >
        <Link href="/" className="brand">
          <Logo />
          <span>
            Zeta<span>Install</span>
          </span>
        </Link>
        <div className="workspace-select">
          <div className="workspace-avatar">
            {c.user ? c.user.name[0].toUpperCase() : "Z"}
          </div>
          <div>
            <strong>
              {c.user
                ? c.user.name.split(" ")[0] + "’s workspace"
                : "Personal workspace"}
            </strong>
            <small>
              {c.user ? "Your infrastructure" : "Let’s build something great"}
            </small>
          </div>
          <button
            className="icon-btn"
            aria-label="Workspace settings"
            onClick={() => {
              if (c.user) window.location.href = "/settings";
              else c.auth("register");
            }}
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map((item) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className={
                    "nav-item " +
                    (path === item.href ||
                    (item.href === "/servers" && path.startsWith("/servers/"))
                      ? "active"
                      : "")
                  }
                >
                  <item.icon />
                  <span>{item.label}</span>
                  {item.href === "/servers" && c.servers.length > 0 && (
                    <span className="nav-count">{c.servers.length}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/documentation"
            className={
              "nav-item " + (path === "/documentation" ? "active" : "")
            }
          >
            <BookOpen />
            Documentation
            <ArrowUpRight size={12} style={{ marginLeft: "auto" }} />
          </Link>
          <Link
            href="/settings"
            className={"nav-item " + (path === "/settings" ? "active" : "")}
          >
            <Settings />
            Account Settings
          </Link>
          {c.user?.role === "administrator" && (
            <Link href="/admin" className="nav-item">
              <Users />
              Administration
            </Link>
          )}
          <div className="secure-note">
            <strong>
              <ShieldCheck size={13} />
              Your servers. Your control.
            </strong>
            <small>
              Encrypted credentials.
              <br />
              Secure connections. Always.
            </small>
          </div>
          <div className="side-footer">
            <span>
              <i />
              ZetaInstall v0.1.0
            </span>
            <span>Built for builders</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="crumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={mobile}
              aria-controls="workspace-navigation"
              onClick={() => setMobile((v) => !v)}
            >
              {mobile ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-button"
              onClick={() => setSearch(true)}
              aria-label="Search pages and documentation"
            >
              <Search size={13} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-btn"
              aria-label="View recent notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={17} />
              {c.activity.length > 0 && <span className="notification-dot" />}
            </button>
            <div className="top-divider" />
            {c.user ? (
              <Link
                href="/settings"
                className="profile-button"
                aria-label="Open account settings"
              >
                {c.user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((s: string) => s[0])
                  .join("")
                  .toUpperCase()}
              </Link>
            ) : (
              <button
                className="profile-button"
                onClick={() => c.auth("login")}
                aria-label="Sign in"
              >
                <LogIn size={14} />
              </button>
            )}
          </div>
        </header>
        <main className="content">
          <Suspense
            fallback={<p style={{ color: "#8991a5" }}>Loading workspace…</p>}
          >
            <Content />
          </Suspense>
          <footer className="workspace-footer">
            <span>
              © {new Date().getFullYear()} ZetaInstall. Your infrastructure,
              simplified.
            </span>
            <div>
              <Link href="/features">About ZetaInstall</Link>
              <Link href="/documentation">
                Help & documentation <span style={{ fontSize: 10 }}>↗</span>
              </Link>
            </div>
          </footer>
        </main>
      </div>
      {c.toast && (
        <div
          className={"toast " + (c.toast.error ? "error" : "")}
          role={c.toast.error ? "alert" : "status"}
        >
          {c.toast.error ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle size={18} />
          )}
          <span>{c.toast.text}</span>
        </div>
      )}
      {c.authMode && (
        <Modal
          title={
            c.authMode === "register"
              ? "Create your workspace"
              : c.authMode === "forgot"
                ? "Reset your password"
                : "Welcome back"
          }
          onClose={() => c.setAuthMode(null)}
        >
          <AuthForm
            key={c.authMode}
            mode={c.authMode}
            onDone={() => c.setAuthMode(null)}
            onMode={c.setAuthMode}
          />
        </Modal>
      )}
      {search && (
        <Modal title="Find your next step" onClose={() => setSearch(false)}>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              autoFocus
              placeholder="Search pages or documentation..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div
            className="search-results"
            style={{ maxHeight: 370, overflow: "auto", marginTop: 16 }}
          >
            {[
              ...nav.flatMap((g) => g.items),
              {
                label: "Install directly",
                href: "/installation-center",
                icon: Server,
              },
              { label: "UpCloud Special Setup", href: "/upcloud", icon: Cloud },
              ...articles.map((a, i) => ({
                label: a.title,
                href: "/documentation?article=" + i,
                icon: BookOpen,
              })),
            ]
              .filter((x) =>
                x.label.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 12)
              .map((x, i) => (
                <Link
                  key={x.href + i}
                  href={x.href}
                  onClick={() => {
                    setSearch(false);
                    setQuery("");
                  }}
                >
                  <x.icon />
                  {x.label}
                  <ChevronRight size={12} style={{ marginLeft: "auto" }} />
                </Link>
              ))}
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="Recent workspace activity"
          onClose={() => setNotifications(false)}
        >
          {c.activity.length ? (
            c.activity.slice(0, 7).map((a) => (
              <div className="session-row" key={a.id}>
                <Activity size={15} />
                <div>
                  <strong>{a.action.replaceAll(".", " · ")}</strong>
                  <small>{new Date(a.created_at).toLocaleString()}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="modal-description">
              No notifications yet. Important workspace actions will appear here
              after you sign in.
            </p>
          )}
          <Link
            href="/activity"
            className="btn"
            style={{ marginTop: 20 }}
            onClick={() => setNotifications(false)}
          >
            Open audit log
            <ArrowUpRight size={12} />
          </Link>
        </Modal>
      )}
    </div>
  );
}
export default function Workspace() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
