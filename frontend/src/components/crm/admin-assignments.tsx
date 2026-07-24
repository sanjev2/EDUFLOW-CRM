"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

type Counsellor = { _id: string; fullName: string; email: string; assignmentCount: number };
type Application = { _id: string; studentId: { _id: string; fullName: string; email: string }; stage: string };

export function AdminAssignments() {
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [studentId, setStudentId] = useState("");
  const [counsellorId, setCounsellorId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [counsellorResult, applicationResult] = await Promise.all([
      api<{ counsellors: Counsellor[] }>("/api/v1/crm/assignments/counsellors"),
      api<{ applications: Application[] }>("/api/v1/crm/assignments/unassigned"),
    ]);
    setCounsellors(counsellorResult.counsellors);
    setApplications(applicationResult.applications);
  }

  useEffect(() => { void load().catch((loadError: Error) => setError(loadError.message)); }, []);

  const trimmedReason = reason.trim();
  const valid =
    applications.some((item) => item.studentId._id === studentId) &&
    counsellors.some((item) => item._id === counsellorId) &&
    trimmedReason.length >= 10 &&
    trimmedReason.length <= 500 &&
    !submitting;

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !window.confirm("Confirm this counsellor assignment?")) return;
    setSubmitting(true);
    try {
      await refreshCsrf();
      await api("/api/v1/crm/assignments", { method: "POST", body: JSON.stringify({ studentId, counsellorId, reason: trimmedReason }) });
      setStudentId(""); setCounsellorId(""); setReason("");
      await load();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "The assignment could not be completed.");
    } finally { setSubmitting(false); }
  }

  const guidance = applications.length === 0
    ? "An assignment can be made when an unassigned student is available."
    : counsellors.length === 0
      ? "An assignment requires at least one active counsellor."
      : "Select a student and counsellor, then enter an audit reason of 10 to 500 characters.";

  return <AppShell role="ADMIN" title="Assignments" subtitle="Balance counsellor workload and resolve unassigned enquiries.">
    {error && <p role="alert">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Unassigned enquiries">{applications.length ? <ul className="space-y-3">{applications.map((item) => <li key={item._id} className="rounded-lg border p-4"><p className="font-bold">{item.studentId.fullName}</p><p className="text-sm text-[var(--muted)]">{item.studentId.email}</p><Badge tone="warning">{item.stage}</Badge></li>)}</ul> : <EmptyState title="No unassigned enquiries" description="Automatic assignment has covered every active enquiry." />}</Panel>
      <Panel title="Counsellor workload">{counsellors.length ? <ul className="space-y-3">{counsellors.map((item) => <li className="flex justify-between rounded-lg border p-4" key={item._id}><div><p className="font-bold">{item.fullName}</p><p className="text-sm text-[var(--muted)]">{item.email}</p></div><Badge>{item.assignmentCount} students</Badge></li>)}</ul> : <EmptyState title="No active counsellors" description="Create and activate a counsellor before assigning enquiries." />}</Panel>
      <Panel title="Manual assignment" className="xl:col-span-2">
        <form onSubmit={assign} className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">Student<select name="studentId" required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="min-h-11 rounded-lg border px-3"><option value="">Select unassigned student</option>{applications.map((item) => <option value={item.studentId._id} key={item.studentId._id}>{item.studentId.fullName}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Counsellor<select name="counsellorId" required value={counsellorId} onChange={(event) => setCounsellorId(event.target.value)} className="min-h-11 rounded-lg border px-3"><option value="">Select counsellor</option>{counsellors.map((item) => <option value={item._id} key={item._id}>{item.fullName} ({item.assignmentCount})</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Audit reason<input name="reason" minLength={10} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 rounded-lg border px-3" /></label>
          <p id="assignment-guidance" className="text-sm text-[var(--muted)] md:col-span-3">{guidance}</p>
          <PrimaryButton type="submit" disabled={!valid} aria-describedby="assignment-guidance" className="md:col-span-3 md:justify-self-start disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{submitting ? "Assigning…" : "Confirm assignment"}</PrimaryButton>
        </form>
      </Panel>
    </div>
  </AppShell>;
}
