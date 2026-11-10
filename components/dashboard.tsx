"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Server,
  Network,
  KeyRound,
  Activity,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  Terminal,
  Boxes,
  Cloud,
  Check,
  ChevronRight,
  Clock,
  Zap,
  Globe,
  Lock,
  Layers,
  Download,
  Search,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Heading, Empty, Badge, DocsLink } from "./ui";
import { relative } from "@/lib/client";
export const installationOptions = [
  {
    title: "Pterodactyl Panel",
    description:
      "Your game server control center. Set up a complete, secure Panel.",
    icon: Layers,
    color: "",
    label: "PANEL INSTALLER",
    tag: "v1.15.2",
    href: "/install/panel",
    action: "Install Panel",
  },
  {
    title: "Pterodactyl Wings",
    description:
      "Power your nodes with Docker. Connect to your existing Panel.",
    icon: Boxes,
    color: "blue",
    label: "WINGS INSTALLER",
    tag: "v1.13.4",
    href: "/install/wings",
    action: "Install Wings",
  },
  {
    title: "UpCloud Special Setup",
    description: "A dedicated setup for your network, TLS, and reverse proxy.",
    icon: Cloud,
    color: "pink",
    label: "PROVIDER SETUP",
    tag: "SPECIALIZED",
    href: "/upcloud",
    action: "Configure UpCloud",
  },
];
export function InstallCards() {
  return (
    <div className="installation-grid">
      {installationOptions.map((o) => (
        <Link key={o.title} href={o.href} className="install-card">
          <div className="install-card-top">
            <span className={`install-icon ${o.color}`}>
              <o.icon />
            </span>
            <span className={`pill ${o.color === "blue" ? "blue" : "purple"}`}>
              {o.tag}
            </span>
          </div>
          <h3>{o.title}</h3>
          <p>{o.description}</p>
          <div className="install-bottom">
            <span>{o.action}</span>
            <ArrowUpRight />
          </div>
        </Link>
      ))}
    </div>
  );
}
export function ServerTable({
  limit,
  search = "",
}: {
  limit?: number;
  search?: string;
}) {
  const { servers } = useWorkspace();
  const rows = servers
    .filter((s) =>
      (s.name + " " + s.host + " " + s.provider)
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, limit);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SERVER NAME</th>
              <th>PROVIDER / REGION</th>
              <th>STATUS</th>
              <th>RESOURCES</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {!!rows.length && (
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={"/servers/" + s.id}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div className="stat-icon">
                        <Server />
                      </div>
                      <div>
                        <strong>{s.name}</strong>
                        <div
                          style={{
                            fontSize: 9,
                            color: "#657089",
                            marginTop: 5,
                          }}
                        >
                          {s.host}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td>{s.provider}</td>
                  <td>
                    <Badge status={s.status} />
                  </td>
                  <td>
                    {s.evidence?.cpus || "–"} vCPU ·{" "}
                    {s.evidence?.ram_bytes
                      ? (s.evidence.ram_bytes / 1024 ** 3).toFixed(0)
                      : "–"}{" "}
                    GB
                  </td>
                  <td>
                    <Link
                      href={"/servers/" + s.id}
                      aria-label={"Open " + s.name}
                    >
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {!rows.length && (
        <Empty
          title={
            search
              ? "No matching servers"
              : "A fresh start for your infrastructure"
          }
          description={
            search
              ? "Try another server name, provider, or IP address."
              : "Connect your first VPS to manage your infrastructure, run diagnostics, and start installing."
          }
        >
          {!search && (
            <Link className="btn small" href="/servers/add">
              <Plus size={12} />
              Connect your first VPS
            </Link>
          )}
        </Empty>
      )}
    </>
  );
}
export default function Dashboard() {
  const ctx = useWorkspace();
  const active = ctx.jobs.filter(
    (j) => !["Failed", "Completed", "Cancelled"].includes(j.status),
  ).length;
  const steps = [
    {
      title: "Create your workspace",
      description: "A secure home for your infrastructure",
      done: !!ctx.user,
      href: "account",
    },
    {
      title: "Generate an SSH key",
      description: "Your secure connection starts here",
      done: ctx.keys.length > 0,
      href: "/ssh-keys",
    },
    {
      title: "Connect your first VPS",
      description: "Any provider. One dashboard.",
      done: ctx.servers.length > 0,
      href: "/servers/add",
    },
    {
      title: "Run your first installation",
      description: "Let your infrastructure take shape",
      done: ctx.jobs.some(
        (j) => j.status === "Completed" && j.type.startsWith("install"),
      ),
      href: "/installation-center",
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  return (
    <>
      <Heading
        title="Dashboard"
        description="A clear view of your infrastructure. All in one place."
      >
        <Link href="/documentation" className="btn secondary">
          <BookOpen />
          Documentation
        </Link>
        <Link href="/servers/add" className="btn primary">
          <Plus />
          Add VPS
        </Link>
      </Heading>
      <div className="hero">
        <div>
          <div className="hero-label">
            <span style={{ fontSize: 12 }}>✦</span> BUILT FOR YOUR NEXT
            DEPLOYMENT
          </div>
          <h2>Your infrastructure. Under control.</h2>
          <p>
            Connect any VPS. Install Pterodactyl. Manage it all.
            <br />
            Less configuration, more possibilities.
          </p>
          <div className="hero-links">
            <Link href="/installation-center" className="btn primary">
              <Zap size={12} />
              Start an installation
              <ArrowRight size={12} />
            </Link>
            <DocsLink>Explore the guides</DocsLink>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit" />
          <div className="orbit o2" />
          <div className="rack">
            <div className="rack-layer" />
            <div className="rack-layer" />
            <div className="rack-layer" />
          </div>
          <div className="float-icon one">
            <Terminal />
          </div>
          <div className="float-icon two">
            <ShieldCheck />
          </div>
        </div>
      </div>
      <div className="stats-grid">
        {[
          {
            name: "Total servers",
            value: ctx.servers.length,
            icon: Server,
            color: "",
            foot: ctx.servers.length
              ? "Connected to your workspace"
              : "Connect your first server",
          },
          {
            name: "Connected nodes",
            value: ctx.nodes.length,
            icon: Network,
            color: "blue",
            foot: ctx.nodes.length
              ? "Verification shown per node"
              : "No nodes connected yet",
          },
          {
            name: "SSH keys",
            value: ctx.keys.length,
            icon: KeyRound,
            color: "green",
            foot: ctx.keys.length
              ? "Encrypted in your vault"
              : "Your secure access, managed",
          },
          {
            name: "Active installations",
            value: active,
            icon: Activity,
            color: "orange",
            foot: active
              ? "Worker is processing jobs"
              : "No installations in progress",
          },
        ].map((s) => (
          <div className="stat-card" key={s.name}>
            <div className="stat-top">
              <span>{s.name}</span>
              <div className={`stat-icon ${s.color}`}>
                <s.icon />
              </div>
            </div>
            <div className="stat-value">
              {s.value.toString().padStart(2, "0")}
            </div>
            <svg viewBox="0 0 73 18" className="stat-chart" aria-hidden="true">
              <line x1="0" y1="15" x2="73" y2="15" />
            </svg>
            <div className="stat-foot">
              <span className="dot" />
              {s.foot}
            </div>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2 className="section-title">
            <Zap />
            Installation Center
          </h2>
          <div className="section-subtitle">
            From a fresh VPS to a ready-to-use environment.
          </div>
        </div>
        <Link href="/installation-center" className="text-link">
          View all installers
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <InstallCards />
      <div className="dash-columns">
        <div>
          <div className="panel">
            <div className="panel-header">
              <h3>
                My servers <span className="count">{ctx.servers.length}</span>
              </h3>
              <Link className="text-link" href="/servers">
                View all servers
                <ArrowUpRight size={12} />
              </Link>
            </div>
            <ServerTable limit={4} />
            <div className="panel-footer">
              <ShieldCheck />
              Secure SSH connections. Your credentials stay encrypted.
            </div>
          </div>
          <div className="panel activity-panel">
            <div className="panel-header">
              <h3>
                <Clock size={13} color="#8e93a6" />
                Recent activity
              </h3>
              <Link href="/activity" className="text-link">
                View activity
                <ArrowUpRight size={12} />
              </Link>
            </div>
            {ctx.activity.length ? (
              <div className="activity-list">
                {ctx.activity.slice(0, 3).map((a) => (
                  <div className="activity-item" key={a.id}>
                    <div className="activity-symbol">
                      <Activity />
                    </div>
                    <span>
                      {a.action.replaceAll(".", " · ").replaceAll("_", " ")}
                    </span>
                    <time>{relative(a.created_at)}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <p style={{ marginBottom: 0 }}>
                  Your workspace activity will appear here.
                  <br />
                  Every important action, recorded securely.
                </p>
              </div>
            )}
          </div>
        </div>
        <aside
          className="dash-right"
          aria-label="Getting started and platform status"
        >
          <div className="panel">
            <div className="panel-header">
              <h3>
                Make yourself at home{" "}
                <span style={{ color: "#d0a15e" }}>✦</span>
              </h3>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: (completed / 4) * 100 + "%" }}
              />
            </div>
            <div className="progress-label">
              <span>Workspace setup</span>
              <span>{completed} of 4 complete</span>
            </div>
            <div className="checklist">
              {steps.map((s, i) => (
                <Link
                  key={s.title}
                  href={s.href === "account" ? "/settings" : s.href}
                  onClick={(e) => {
                    if (s.href === "account" && !ctx.user) {
                      e.preventDefault();
                      ctx.auth("register");
                    }
                  }}
                  className="checklist-row"
                >
                  <span className={`step-number ${s.done ? "done" : ""}`}>
                    {s.done ? <Check size={11} /> : i + 1}
                  </span>
                  <div>
                    <h4>{s.title}</h4>
                    <p>{s.description}</p>
                  </div>
                  <ChevronRight />
                </Link>
              ))}
            </div>
          </div>
          <div className="panel pad status-card">
            <div className="section-heading">
              <h3 className="section-title" style={{ fontSize: 11 }}>
                Platform status
              </h3>
              <span className={`pill ${ctx.health ? "green" : "orange"}`}>
                <i />
                {ctx.health ? "Operational" : "Connecting"}
              </span>
            </div>
            <div className="status-line">
              <span>Backend API</span>
              <span className="status-label">
                <i style={!ctx.health ? { background: "#c5a569" } : {}} />
                {ctx.health ? "Connected" : "Unavailable"}
              </span>
            </div>
            <div className="status-line">
              <span>Installation worker</span>
              <span className="status-label">
                <i
                  style={
                    ctx.health?.worker !== "online"
                      ? { background: "#c5a569" }
                      : {}
                  }
                />
                {ctx.health?.worker === "online" ? "Online" : "Offline"}
              </span>
            </div>
            <div className="status-line">
              <span>Database storage</span>
              <span style={{ color: "#a1a8bd" }}>
                {ctx.health ? "Persistent" : "Checking"}
              </span>
            </div>
          </div>
        </aside>
      </div>
      <div className="provider-row">
        <span>YOUR CLOUD. YOUR CHOICE.</span>
        <strong>upcloud</strong>
        <strong>aws</strong>
        <strong>DigitalOcean</strong>
        <strong>vultr</strong>
        <strong>HETZNER</strong>
        <span className="etc">+ any VPS with SSH</span>
      </div>
    </>
  );
}
