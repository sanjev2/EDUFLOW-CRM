"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

type Counsellor = { _id: string; fullName: string; email: string; assignmentCount: number };
type Application = { _id: string; studentId: { _id: string; fullName: string; email: string }; stage: string };

export function AdminAssignments() {
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]); const [applications, setApplications] = useState<Application[]>([]);
  const [applicationId, setApplicationId] = useState(""); const [counsellorId, setCounsellorId] = useState(""); const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ assigned: number; remaining: number; skipped: number }>();
  async function load() {
    const [staff, pending] = await Promise.all([
      api<{ counsellors: Counsellor[] }>("/api/v1/crm/assignments/counsellors", { cache: "no-store" }),
      api<{ applications: Application[] }>("/api/v1/crm/assignments/unassigned", { cache: "no-store" }),
    ]);
    setCounsellors(staff.counsellors); setApplications(pending.applications);
  }
  useEffect(() => { void load().catch(() => setError("Assignment data could not be loaded.")); }, []);
  const trimmedReason = reason.trim();
  const valid = applications.some((item) => item._id === applicationId) && counsellors.some((item) => item._id === counsellorId) && trimmedReason.length >= 10 && trimmedReason.length <= 500 && !submitting;
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!valid || !window.confirm("Confirm this counsellor assignment?")) return;
    setSubmitting(true); setError("");
    try { await refreshCsrf(); await api("/api/v1/crm/assignments", { method: "POST", body: JSON.stringify({ applicationId, counsellorId, reason: trimmedReason }) }); setApplicationId(""); setCounsellorId(""); setReason(""); await load(); }
    catch { setError("The assignment could not be completed."); } finally { setSubmitting(false); }
  }
  async function runAutomatic() {
    if (!window.confirm("Run automatic assignment for the oldest unassigned applications?")) return;
    setSubmitting(true); setError("");
    try { await refreshCsrf(); const value = await api<{ assigned: number; remaining: number; skipped: number }>("/api/v1/crm/assignments/automatic", { method: "POST", body: JSON.stringify({ confirmation: "RUN AUTOMATIC ASSIGNMENT" }) }); setResult(value); await load(); }
    catch { setError("Automatic assignment could not be completed."); } finally { setSubmitting(false); }
  }
  const guidance = applications.length === 0 ? "No unassigned application is available." : counsellors.length === 0 ? "At least one active, verified counsellor is required." : "Select an application and counsellor, then enter an audit reason of 10 to 500 characters.";
  return <AppShell role="ADMIN" title="Assignments" subtitle="Balance unique-student workload and resolve unassigned applications." actions={<PrimaryButton disabled={submitting || !applications.length || !counsellors.length} onClick={() => void runAutomatic()}>Run automatic assignment</PrimaryButton>}>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {result && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-900">Assigned {result.assigned}; remaining {result.remaining}; skipped {result.skipped}.</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Unassigned applications">{applications.length ? <ul className="space-y-3">{applications.map((item) => <li key={item._id} className="rounded-lg border p-4"><p className="font-bold">{item.studentId.fullName}</p><p className="text-sm text-[var(--muted)]">{item.studentId.email}</p><p className="mt-1 font-mono text-xs">Application {item._id}</p><div className="mt-2 flex flex-wrap items-center gap-3"><Badge tone="warning">{item.stage}</Badge><span className="text-xs text-[var(--muted)]">No eligible counsellor was available at creation.</span><Link href={`/admin/applications/${item._id}`} className="font-semibold text-blue-700">View</Link></div></li>)}</ul> : <EmptyState title="No unassigned applications" description="Automatic assignment has covered every active enquiry." />}</Panel>
      <Panel title="Counsellor workload">{counsellors.length ? <ul className="space-y-3">{counsellors.map((item) => <li className="flex justify-between rounded-lg border p-4" key={item._id}><div><p className="font-bold">{item.fullName}</p><p className="text-sm text-[var(--muted)]">{item.email}</p></div><Badge>{item.assignmentCount} students</Badge></li>)}</ul> : <EmptyState title="No eligible counsellors" description="Activate and verify a counsellor before assigning applications." />}</Panel>
      <Panel title="Manual assignment" className="xl:col-span-2"><form onSubmit={assign} className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Application<select name="applicationId" required value={applicationId} onChange={(event) => setApplicationId(event.target.value)} className="min-h-11 rounded-lg border px-3"><option value="">Select unassigned application</option>{applications.map((item) => <option value={item._id} key={item._id}>{item.studentId.fullName} — {item._id.slice(-6)}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Counsellor<select name="counsellorId" required value={counsellorId} onChange={(event) => setCounsellorId(event.target.value)} className="min-h-11 rounded-lg border px-3"><option value="">Select counsellor</option>{counsellors.map((item) => <option value={item._id} key={item._id}>{item.fullName} ({item.assignmentCount})</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Audit reason<input name="reason" minLength={10} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 rounded-lg border px-3" /></label>
        <p id="assignment-guidance" className="text-sm text-[var(--muted)] md:col-span-3">{guidance}</p>
        <PrimaryButton type="submit" disabled={!valid} aria-describedby="assignment-guidance" className="md:col-span-3 md:justify-self-start disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{submitting ? "Assigning…" : "Confirm assignment"}</PrimaryButton>
      </form></Panel>
    </div>
  </AppShell>;
}
