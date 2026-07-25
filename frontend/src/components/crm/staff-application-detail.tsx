"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell, type AppRole } from "../app-shell";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

const next: Record<string, string | undefined> = {
  ENQUIRY_RECORDED: "PROFILE_ASSESSMENT", PROFILE_ASSESSMENT: "COUNSELLING", COUNSELLING: "COURSE_SHORTLISTING",
  COURSE_SHORTLISTING: "DOCUMENTS_PENDING", DOCUMENTS_PENDING: "APPLICATION_PREPARATION",
  APPLICATION_PREPARATION: "INSTITUTION_SUBMITTED", INSTITUTION_SUBMITTED: "OFFER_RECEIVED",
  OFFER_RECEIVED: "OFFER_CONDITIONS_PENDING", OFFER_CONDITIONS_PENDING: "OFFER_ACCEPTED",
  OFFER_ACCEPTED: "VISA_PREPARATION", VISA_PREPARATION: "VISA_READY_TO_LODGE",
  VISA_READY_TO_LODGE: "VISA_LODGED", VISA_LODGED: "VISA_ADDITIONAL_INFORMATION",
  VISA_ADDITIONAL_INFORMATION: "VISA_DECISION", VISA_DECISION: "PRE_DEPARTURE", PRE_DEPARTURE: "ENROLLED",
};
const label = (value: string) => value.replaceAll("_", " ");
type Data = { application: { _id: string; stage: string; archivedAt?: string; discontinuationReason?: string; checklist: { key: string; label: string; category: string; status: string; feedback?: string }[]; studentId: { fullName?: string; email?: string } | string }; history: { _id: string; newStage: string; reason: string; createdAt: string }[] };

export function StaffApplicationDetail({ applicationId, role }: { applicationId: string; role: Extract<AppRole, "COUNSELLOR" | "ADMIN"> }) {
  const [data, setData] = useState<Data>(); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setData(await api<Data>(`/api/v1/crm/applications/${applicationId}`, { cache: "no-store" })); }, [applicationId]);
  useEffect(() => { void load().catch(() => setError("Application details could not be loaded.")); }, [load]);
  async function mutate(path: string, body: object, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await refreshCsrf(); await api(path, { method: "POST", body: JSON.stringify(body) }); setSuccess(message); await load(); }
    catch { setError("The application could not be updated. Refresh and try again."); } finally { setBusy(false); }
  }
  async function updateChecklist(key: string, status: string) {
    setBusy(true); setError("");
    try { await refreshCsrf(); await api(`/api/v1/crm/applications/${applicationId}/checklist/${key}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); }
    catch { setError("The checklist item could not be updated."); } finally { setBusy(false); }
  }
  async function discontinue() {
    const reason = window.prompt("Reason for discontinuing this application (required)");
    if (!reason || !window.confirm("Discontinue only this application? The student account and other applications remain active.")) return;
    await mutate(`/api/v1/crm/applications/${applicationId}/discontinue`, { reason, confirm: true }, "Application discontinued. Other student records were not changed.");
  }
  async function archive() {
    const reason = window.prompt("Archive reason (required)");
    const confirmation = window.prompt('Type "ARCHIVE APPLICATION" to confirm');
    if (!reason || confirmation !== "ARCHIVE APPLICATION") return;
    await mutate(`/api/v1/crm/applications/${applicationId}/archive`, { reason, confirmation }, "Application archived.");
  }
  async function restore() {
    const reason = window.prompt("Restoration reason (required)");
    const confirmation = window.prompt('Type "RESTORE APPLICATION" to confirm');
    if (!reason || confirmation !== "RESTORE APPLICATION") return;
    await mutate(`/api/v1/crm/applications/${applicationId}/restore`, { reason, confirmation }, "Application restored without changing its terminal lifecycle state.");
  }
  const terminal = data && ["DISCONTINUED", "VISA_REFUSED", "ENROLLED", "COMPLETED", "CANCELLED"].includes(data.application.stage);
  return <AppShell role={role} title="Application workflow" subtitle="Manage the selected application without changing the student’s other records.">
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{success && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-900">{success}</p>}
    {!data ? <p role="status">Loading application…</p> : <div className="grid gap-6">
      <Panel title="Lifecycle" action={<Badge>{label(data.application.stage)}</Badge>}><div className="flex flex-wrap gap-3">
        {next[data.application.stage] && data.application.stage !== "VISA_DECISION" && !data.application.archivedAt && <PrimaryButton disabled={busy} onClick={() => void mutate(`/api/v1/crm/applications/${applicationId}/transition`, { stage: next[data.application.stage], note: `Progressed to ${label(next[data.application.stage]!)}` }, `Moved to ${label(next[data.application.stage]!)}`)}>Move to {label(next[data.application.stage]!)}</PrimaryButton>}
        {data.application.stage === "VISA_DECISION" && !data.application.archivedAt && <><PrimaryButton disabled={busy} onClick={() => void mutate(`/api/v1/crm/applications/${applicationId}/transition`, { stage: "PRE_DEPARTURE", outcome: "APPROVED", note: "Approved visa outcome recorded" }, "Approved outcome recorded; moved to pre-departure.")}>Record approved outcome</PrimaryButton><button disabled={busy} onClick={() => void mutate(`/api/v1/crm/applications/${applicationId}/transition`, { stage: "VISA_REFUSED", outcome: "REFUSED", note: "Refused visa outcome recorded" }, "Refused outcome recorded.")} className="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800">Record refused outcome</button></>}
        {!terminal && !data.application.archivedAt && <button disabled={busy} onClick={() => void discontinue()} className="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800">Discontinue process</button>}
        {terminal && !data.application.archivedAt && <button disabled={busy} onClick={() => void archive()} className="min-h-11 rounded-lg border px-4 font-semibold">Archive application</button>}
        {role === "ADMIN" && data.application.archivedAt && <button disabled={busy} onClick={() => void restore()} className="min-h-11 rounded-lg border px-4 font-semibold">Restore application</button>}
      </div><p className="mt-4 text-sm text-[var(--muted)]">EduFlow tracks workflow readiness and does not provide legal advice or guarantee visa approval.</p></Panel>
      <Panel title="Checklist">{data.application.checklist.length ? <ul className="grid gap-3 md:grid-cols-2">{data.application.checklist.map((item) => <li key={item.key} className="rounded-lg border p-3"><p className="font-semibold">{item.label}</p><label className="mt-2 grid gap-1 text-sm">Status<select disabled={busy || Boolean(data.application.archivedAt) || Boolean(terminal)} value={item.status} onChange={(event) => void updateChecklist(item.key, event.target.value)} className="min-h-11 rounded-lg border px-2">{["NOT_STARTED", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REPLACEMENT_REQUIRED", "NOT_APPLICABLE"].map((status) => <option key={status}>{status}</option>)}</select></label></li>)}</ul> : <EmptyState title="No checklist" description="No checklist items are available." />}</Panel>
      <Panel title="Immutable history">{data.history.length ? <ol className="space-y-3">{data.history.map((item) => <li key={item._id} className="border-l-2 border-blue-200 pl-3"><strong>{label(item.newStage)}</strong><p className="text-sm text-[var(--muted)]">{item.reason}</p><time className="text-xs">{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol> : <EmptyState title="No history" description="Lifecycle events will appear here." />}</Panel>
    </div>}
  </AppShell>;
}
