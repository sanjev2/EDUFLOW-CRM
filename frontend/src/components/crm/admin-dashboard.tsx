"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ClipboardList, UserRoundSearch, Users } from "lucide-react";
import { AppShell } from "../app-shell";
import { EmptyState, MetricCard, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";

type Summary = {
  totalStudents: number; activeCounsellors: number; unassignedEnquiries: number;
  openTasks: number; securityAlerts: number;
  stageSummary: { _id: string; count: number }[];
  recentAudit: { _id: string; event: string; createdAt: string }[];
};

export function AdminDashboard() {
  const [data, setData] = useState<Summary>(); const [error, setError] = useState("");
  useEffect(() => { void api<Summary>("/api/v1/crm/dashboard/admin").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  const largestStage = Math.max(1, ...(data?.stageSummary.map((item) => item.count) ?? []));
  return <AppShell role="ADMIN" title="Administrator dashboard" subtitle="Monitor users, workload, applications and security activity.">
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <MetricCard label="Students" value={data?.totalStudents ?? "—"} hint="Registered accounts" icon={<Users />} />
      <MetricCard label="Active counsellors" value={data?.activeCounsellors ?? "—"} hint="Available staff" icon={<UserRoundSearch />} />
      <MetricCard label="Unassigned enquiries" value={data?.unassignedEnquiries ?? "—"} hint="Awaiting ownership" />
      <MetricCard label="Open tasks" value={data?.openTasks ?? "—"} hint="Team follow-ups" icon={<ClipboardList />} />
      <MetricCard label="Security alerts" value={data?.securityAlerts ?? "—"} hint="Recorded alerts" icon={<AlertTriangle />} />
    </div>
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
      <Panel title="Application distribution">
        {!data ? <p role="status" className="py-4 text-sm text-[var(--muted)]">Loading application data…</p> : data.stageSummary.length ? <ul className="grid gap-4">{data.stageSummary.map((item) => <li key={item._id} className="grid gap-2"><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-[var(--text)]">{item._id.replaceAll("_", " ")}</span><strong className="text-[var(--navy)]">{item.count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(8, (item.count / largestStage) * 100)}%` }} /></div></li>)}</ul> : <EmptyState title="No application data" description="Stage distribution will appear after students create enquiries." />}
      </Panel>
      <Panel title="Recent audit activity" action={<Link className="rounded-lg px-2 py-1 text-sm font-bold text-[var(--primary-hover)] hover:bg-blue-50" href="/admin/audit-logs">View all</Link>}>
        {!data ? <p role="status" className="py-4 text-sm text-[var(--muted)]">Loading audit activity…</p> : data.recentAudit.length ? <ol className="grid gap-1">{data.recentAudit.map((item) => <li key={item._id} className="grid grid-cols-[36px_1fr] gap-3 rounded-xl p-2.5 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-[var(--navy)]"><Activity aria-hidden size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--text)]">{item.event.replaceAll("_", " ")}</p><time className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</time></div></li>)}</ol> : <EmptyState title="No recent audit events" description="Meaningful security and CRM changes will appear here." />}
      </Panel>
    </div>
  </AppShell>;
}
