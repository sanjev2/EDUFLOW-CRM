"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";
export function AdminAuditLogs() {
  const [logs, setLogs] = useState<{ _id: string; event: string; actorId?: string; subjectId?: string; createdAt: string }[]>([]); const [event, setEvent] = useState("");
  useEffect(() => { void api<{ logs: typeof logs }>(`/api/v1/admin/audit-logs?limit=50${event ? `&event=${encodeURIComponent(event)}` : ""}`).then((result) => setLogs(result.logs)); }, [event]);
  return <AppShell role="ADMIN" title="Audit logs" subtitle="Append-oriented evidence of meaningful security and CRM changes."><Panel title="Recent events"><label className="mb-4 grid max-w-md gap-1 text-sm font-semibold">Exact event filter<input value={event} onChange={(e) => setEvent(e.target.value)} className="min-h-11 rounded-lg border px-3" /></label>{logs.length ? <ul className="space-y-2">{logs.map((log) => <li key={log._id} className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-bold">{log.event.replaceAll("_", " ")}</p><p className="text-[var(--muted)]">Actor {log.actorId ?? "system"} · Subject {log.subjectId ?? "none"}</p></div><time>{new Date(log.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No audit events" description="No events match the current filter." />}</Panel></AppShell>;
}
export function AdminSecurityAlerts() {
  const [alerts, setAlerts] = useState<{ _id: string; type: string; severity: "LOW"|"MEDIUM"|"HIGH"; createdAt: string }[]>([]);
  useEffect(() => { void api<{ alerts: typeof alerts }>("/api/v1/admin/security-alerts?limit=50").then((result) => setAlerts(result.alerts)); }, []);
  return <AppShell role="ADMIN" title="Security alerts" subtitle="Read-only operational and authentication alerts."><Panel title="Alert feed">{alerts.length ? <ul className="space-y-3">{alerts.map((alert) => <li key={alert._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><p className="font-bold">{alert.type.replaceAll("_", " ")}</p><time className="text-sm text-[var(--muted)]">{new Date(alert.createdAt).toLocaleString()}</time></div><Badge tone={alert.severity === "HIGH" ? "danger" : alert.severity === "MEDIUM" ? "warning" : "info"}>{alert.severity}</Badge></li>)}</ul> : <EmptyState title="No security alerts" description="New safe alert context will appear here." />}</Panel></AppShell>;
}
