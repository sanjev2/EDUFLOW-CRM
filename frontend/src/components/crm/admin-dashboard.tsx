"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, UserRoundSearch, Users } from "lucide-react";
import { AppShell } from "../app-shell";
import { EmptyState, MetricCard, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";
type Summary = { totalStudents: number; activeCounsellors: number; unassignedEnquiries: number; openTasks: number; securityAlerts: number; stageSummary: { _id: string; count: number }[]; recentAudit: { _id: string; event: string; createdAt: string }[] };
export function AdminDashboard() {
  const [data, setData] = useState<Summary>(); const [error, setError] = useState("");
  useEffect(() => { void api<Summary>("/api/v1/crm/dashboard/admin").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  return <AppShell role="ADMIN" title="Administrator dashboard" subtitle="A safe operational view of users, workload and applications.">{error && <p role="alert">{error}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Students" value={data?.totalStudents ?? "—"} icon={<Users />} /><MetricCard label="Active counsellors" value={data?.activeCounsellors ?? "—"} icon={<UserRoundSearch />} /><MetricCard label="Unassigned enquiries" value={data?.unassignedEnquiries ?? "—"} /><MetricCard label="Open tasks" value={data?.openTasks ?? "—"} icon={<ClipboardList />} /><MetricCard label="Security alerts" value={data?.securityAlerts ?? "—"} icon={<AlertTriangle />} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Application distribution">{data?.stageSummary.length ? <ul className="space-y-3">{data.stageSummary.map((item) => <li key={item._id} className="flex justify-between border-b pb-2 text-sm"><span>{item._id.replaceAll("_", " ")}</span><strong>{item.count}</strong></li>)}</ul> : <EmptyState title="No application data" description="Stage distribution appears after student enquiries." />}</Panel><Panel title="Recent audit activity" action={<Link className="text-sm font-semibold text-[var(--navy)]" href="/admin/audit-logs">View all</Link>}>{data?.recentAudit.length ? <ul className="space-y-3">{data.recentAudit.map((item) => <li key={item._id} className="flex justify-between gap-3 text-sm"><span>{item.event.replaceAll("_", " ")}</span><time className="text-[var(--muted)]">{new Date(item.createdAt).toLocaleDateString()}</time></li>)}</ul> : <EmptyState title="No recent audit events" description="Meaningful security and CRM changes appear here." />}</Panel></div></AppShell>;
}
