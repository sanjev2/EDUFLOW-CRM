"use client";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ShieldCheck } from "lucide-react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";

export function AdminAuditLogs() {
  const [logs, setLogs] = useState<{ _id: string; event: string; actorId?: string; subjectId?: string; createdAt: string }[]>([]);
  const [event, setEvent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true); setError("");
    void api<{ logs: typeof logs }>(`/api/v1/admin/audit-logs?limit=50${event ? `&event=${encodeURIComponent(event)}` : ""}`)
      .then((result) => setLogs(result.logs)).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [event]);
  return <AppShell role="ADMIN" title="Audit logs" subtitle="Review append-only evidence of meaningful account, security and CRM events."><Panel title="Activity history">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><label className="grid w-full max-w-md gap-1.5 text-sm font-semibold">Filter by exact event<input value={event} onChange={(e) => setEvent(e.target.value)} className="min-h-11 rounded-xl border border-[var(--border)] px-3" placeholder="For example: LOGIN_SUCCESS" /></label><p className="text-sm text-[var(--muted)]">{logs.length} events shown</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p role="status" className="py-5 text-sm text-[var(--muted)]">Loading audit activity…</p> : logs.length ? <ol className="relative ml-4 border-l border-[var(--border)]">{logs.map((log) => <li key={log._id} className="relative pb-5 pl-7 last:pb-0"><span className="absolute -left-[17px] top-0 grid h-8 w-8 place-items-center rounded-full border-4 border-white bg-blue-50 text-[var(--navy)]"><Activity aria-hidden size={14} /></span><article className="rounded-xl border border-[var(--border)] bg-white p-4 hover:border-[var(--light-blue)]"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-extrabold text-[var(--text)]">{log.event.replaceAll("_", " ")}</p><time className="text-xs text-[var(--muted)]">{new Date(log.createdAt).toLocaleString()}</time></div><p className="mt-2 break-all text-xs text-[var(--muted)]">Actor: {log.actorId ?? "System"} · Subject: {log.subjectId ?? "Not applicable"}</p></article></li>)}</ol> : <EmptyState title="No audit events" description="No events match the current exact filter." />}
  </Panel></AppShell>;
}

export function AdminSecurityAlerts() {
  const [alerts, setAlerts] = useState<{ _id: string; type: string; severity: "LOW" | "MEDIUM" | "HIGH"; createdAt: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void api<{ alerts: typeof alerts }>("/api/v1/admin/security-alerts?limit=50")
      .then((result) => setAlerts(result.alerts)).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);
  return <AppShell role="ADMIN" title="Security alerts" subtitle="Review recorded authentication and operational security signals."><Panel title="Alert feed">
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p role="status" className="py-5 text-sm text-[var(--muted)]">Loading security alerts…</p> : alerts.length ? <ul className="grid gap-3">{alerts.map((alert) => {
      const positive = alert.type === "MFA_ENABLED";
      return <li key={alert._id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border border-[var(--border)] p-4">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{positive ? <ShieldCheck aria-hidden size={19} /> : <AlertTriangle aria-hidden size={19} />}</span>
        <div className="min-w-0"><p className="truncate font-extrabold">{alert.type.replaceAll("_", " ")}</p>{positive && <p className="text-sm font-semibold text-emerald-800">Multi-factor authentication was enabled successfully.</p>}<time className="text-xs text-[var(--muted)]">{new Date(alert.createdAt).toLocaleString()}</time></div>
        {positive ? <Badge tone="success">Protection enabled</Badge> : <Badge tone={alert.severity === "HIGH" ? "danger" : alert.severity === "MEDIUM" ? "warning" : "info"}>{alert.severity}</Badge>}
      </li>;
    })}</ul> : <EmptyState title="No security alerts" description="No security alerts are currently recorded." />}
  </Panel></AppShell>;
}
