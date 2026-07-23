"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Clock3, UserRoundSearch } from "lucide-react";
import { AppShell } from "../app-shell";
import { EmptyState, MetricCard, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";
type Summary = { assignedStudents: number; newEnquiries: number; openTasks: number; overdueTasks: number; stageSummary: { _id: string; count: number }[] };
export function CounsellorDashboard() {
  const [data, setData] = useState<Summary>(); const [error, setError] = useState("");
  useEffect(() => { void api<Summary>("/api/v1/crm/dashboard/counsellor").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  return <AppShell role="COUNSELLOR" title="Counsellor dashboard" subtitle="Prioritise assigned students and timely follow-up.">{error && <p role="alert">{error}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Assigned students" value={data?.assignedStudents ?? "—"} icon={<UserRoundSearch />} /><MetricCard label="New enquiries" value={data?.newEnquiries ?? "—"} /><MetricCard label="Open tasks" value={data?.openTasks ?? "—"} icon={<ClipboardList />} /><MetricCard label="Overdue tasks" value={data?.overdueTasks ?? "—"} icon={<Clock3 />} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Application stages">{data?.stageSummary.length ? <ul className="space-y-3">{data.stageSummary.map((item) => <li className="flex justify-between border-b pb-2 text-sm" key={item._id}><span>{item._id.replaceAll("_", " ")}</span><strong>{item.count}</strong></li>)}</ul> : <EmptyState title="No active applications" description="Assigned application stages will appear here." />}</Panel><Panel title="Immediate actions"><div className="grid gap-3"><Link href="/students" className="rounded-lg border p-4 font-semibold hover:border-blue-400">Review assigned students</Link><Link href="/tasks" className="rounded-lg border p-4 font-semibold hover:border-blue-400">Work through follow-up tasks</Link></div></Panel></div></AppShell>;
}
