"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, UserRoundCheck } from "lucide-react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, MetricCard, Panel } from "../dashboard-ui";
import { api } from "@/lib/api";
type Summary = { profileCompletion: number; application: null | { stage: string; updatedAt: string }; assignment: null | { counsellorId: { fullName: string; email: string } }; nextAction: string };
export function StudentDashboard() {
  const [data, setData] = useState<Summary>(); const [error, setError] = useState("");
  useEffect(() => { void api<Summary>("/api/v1/crm/dashboard/student").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  return <AppShell role="STUDENT" title="Student dashboard" subtitle="Track your profile, enquiry and next step.">{error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="Profile completion" value={data ? `${data.profileCompletion}%` : "—"} icon={<UserRoundCheck />} /><MetricCard label="Application stage" value={data?.application?.stage.replaceAll("_", " ") ?? "No enquiry"} icon={<FileText />} /><MetricCard label="Next recommended action" value={data?.nextAction ?? "Loading…"} icon={<ClipboardCheck />} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Application overview">{data?.application ? <div><Badge>{data.application.stage.replaceAll("_", " ")}</Badge><p className="mt-4 text-sm text-[var(--muted)]">Last updated {new Date(data.application.updatedAt).toLocaleDateString()}</p><Link className="mt-4 inline-block font-semibold text-[var(--navy)]" href="/application">View timeline →</Link></div> : <EmptyState title="No enquiry yet" description="Create your first education enquiry when you are ready." action={<Link className="font-semibold text-[var(--navy)]" href="/application">Create enquiry</Link>} />}</Panel><Panel title="Assigned counsellor">{data?.assignment ? <div><p className="font-bold">{data.assignment.counsellorId.fullName}</p><p className="mt-1 text-sm text-[var(--muted)]">{data.assignment.counsellorId.email}</p></div> : <EmptyState title="Not assigned yet" description="A counsellor is assigned automatically after your first enquiry, when one is available." />}</Panel></div></AppShell>;
}
