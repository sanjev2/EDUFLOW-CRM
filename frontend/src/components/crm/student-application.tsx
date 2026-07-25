"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

const workflow = [
  "ENQUIRY_RECORDED", "PROFILE_ASSESSMENT", "COUNSELLING", "COURSE_SHORTLISTING",
  "DOCUMENTS_PENDING", "APPLICATION_PREPARATION", "INSTITUTION_SUBMITTED",
  "OFFER_RECEIVED", "OFFER_CONDITIONS_PENDING", "OFFER_ACCEPTED", "VISA_PREPARATION",
  "VISA_READY_TO_LODGE", "VISA_LODGED", "VISA_ADDITIONAL_INFORMATION",
  "VISA_DECISION", "PRE_DEPARTURE", "ENROLLED",
];
type ChecklistItem = { key: string; category: string; label: string; status: string; feedback?: string };
type Application = {
  _id: string; stage: string; active: boolean; preferredCountry?: string; institution?: string;
  program?: string; preferredStudyLevel?: string; intendedIntake?: string; updatedAt: string;
  assignedCounsellorId?: { fullName: string; email: string }; assignmentState: string;
  checklist: ChecklistItem[]; archivedAt?: string; discontinuationReason?: string;
  submission?: { reference: string; submittedAt: string; integrity: string; stage: string };
};
type Detail = {
  application: Application;
  history: { _id: string; newStage: string; reason: string; createdAt: string }[];
  legalNotice: string;
};
type Filter = "ACTIVE" | "AWAITING" | "COMPLETED" | "DISCONTINUED" | "ARCHIVED";

function category(application: Application): Filter {
  if (application.archivedAt) return "ARCHIVED";
  if (application.stage === "DISCONTINUED" || application.stage === "CANCELLED") return "DISCONTINUED";
  if (["ENROLLED", "VISA_REFUSED", "COMPLETED"].includes(application.stage)) return "COMPLETED";
  if (!application.assignedCounsellorId || application.checklist.some((item) => ["NOT_STARTED", "REPLACEMENT_REQUIRED"].includes(item.status))) return "AWAITING";
  return "ACTIVE";
}
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export function StudentApplication({ applicationId }: { applicationId?: string } = {}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [detail, setDetail] = useState<Detail>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submissionKey = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (applicationId) {
        setDetail(await api<Detail>(`/api/v1/crm/applications/${applicationId}`, { cache: "no-store" }));
      } else {
        const result = await api<{ applications: Application[] }>("/api/v1/crm/applications/mine", { cache: "no-store" });
        setApplications(result.applications);
      }
    } finally {
      setLoading(false);
    }
  }, [applicationId]);
  useEffect(() => { void load().catch(() => { setError("Application information could not be loaded."); setLoading(false); }); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await refreshCsrf();
      await api("/api/v1/crm/applications", { method: "POST", body: JSON.stringify({
        preferredCountry: form.get("preferredCountry") || undefined,
        institution: form.get("institution") || undefined,
        program: form.get("program") || undefined,
        preferredStudyLevel: form.get("preferredStudyLevel") || undefined,
        intendedIntake: form.get("intendedIntake") || undefined,
      }) });
      formElement.reset(); setShowCreate(false); setSuccess("Your new enquiry was recorded."); await load();
    } catch (reason) {
      const code = (reason as Error & { code?: string }).code;
      setError(code === "DUPLICATE_ACTIVE_APPLICATION" ? "An identical active application already exists." : "The enquiry could not be created. Check the details and try again.");
    } finally { setBusy(false); }
  }

  async function submitApplication() {
    if (!detail || !window.confirm("Submit this application for consultancy processing?")) return;
    setBusy(true); setError("");
    try {
      await refreshCsrf();
      submissionKey.current ||= crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      await api(`/api/v1/crm/applications/${detail.application._id}/submit`, {
        method: "POST", headers: { "idempotency-key": submissionKey.current }, body: JSON.stringify({ confirm: true }),
      });
      submissionKey.current = ""; setSuccess("Application submitted securely."); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Application could not be submitted.");
    } finally { setBusy(false); }
  }

  const filtered = useMemo(() => applications.filter((application) => category(application) === filter), [applications, filter]);
  const checklistGroups = detail?.application.checklist.reduce<Record<string, ChecklistItem[]>>((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {}) ?? {};
  if (applicationId) return (
    <AppShell role="STUDENT" title="Application details" subtitle="Follow this application’s independent study and visa-readiness workflow.">
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-900">{success}</p>}
      {loading ? <p role="status">Loading application details…</p> : detail ? <div className="grid gap-6">
        <Panel title={`${detail.application.preferredCountry || "Destination undecided"} application`} action={<Badge>{label(detail.application.stage)}</Badge>}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-[var(--muted)]">Institution</dt><dd className="font-semibold">{detail.application.institution || "Not selected"}</dd></div>
            <div><dt className="text-[var(--muted)]">Programme</dt><dd className="font-semibold">{detail.application.program || "Not selected"}</dd></div>
            <div><dt className="text-[var(--muted)]">Intake</dt><dd className="font-semibold">{detail.application.intendedIntake || "Not selected"}</dd></div>
            <div><dt className="text-[var(--muted)]">Counsellor</dt><dd className="font-semibold">{detail.application.assignedCounsellorId?.fullName || "Awaiting assignment"}</dd></div>
          </dl>
          {detail.application.discontinuationReason && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Discontinued: {detail.application.discontinuationReason}</p>}
          <p className="mt-4 text-sm text-[var(--muted)]">{detail.legalNotice}</p>
          {detail.application.stage === "DOCUMENTS_PENDING" && !detail.application.archivedAt && <PrimaryButton className="mt-4" disabled={busy} onClick={() => void submitApplication()}>{busy ? "Submitting…" : "Submit application"}</PrimaryButton>}
        </Panel>
        <Panel title="Workflow timeline">
          <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{workflow.map((stage) => {
            const reached = workflow.indexOf(stage) <= workflow.indexOf(detail.application.stage);
            return <li key={stage} className={`rounded-lg border p-3 text-sm ${reached ? "border-blue-300 bg-blue-50 font-semibold" : "text-[var(--muted)]"}`}>{label(stage)}</li>;
          })}</ol>
        </Panel>
        <Panel title="Document and readiness checklist">
          <div className="grid gap-4">{Object.entries(checklistGroups).map(([group, items]) => <section key={group}><h3 className="mb-2 text-sm font-bold">{label(group)}</h3><ul className="grid gap-2 sm:grid-cols-2">{items.map((item) => <li className="rounded-lg border p-3 text-sm" key={item.key}><div className="flex justify-between gap-2"><span className="font-semibold">{item.label}</span><Badge>{label(item.status)}</Badge></div>{item.feedback && <p className="mt-1 text-[var(--muted)]">{item.feedback}</p>}</li>)}</ul></section>)}</div>
        </Panel>
        <Panel title="Application history">{detail.history.length ? <ol className="space-y-3 border-l-2 border-blue-100 pl-5">{detail.history.map((item) => <li key={item._id}><p className="font-semibold">{label(item.newStage)}</p><p className="text-sm text-[var(--muted)]">{item.reason}</p><time className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol> : <EmptyState title="No history yet" description="Recorded changes will appear here." />}</Panel>
        <Link href="/application" className="font-semibold text-[var(--primary-hover)]">Back to My Applications</Link>
      </div> : null}
    </AppShell>
  );

  return (
    <AppShell role="STUDENT" title="My Applications" subtitle="Create and follow separate enquiries for different destinations, institutions, programmes or intakes." actions={<PrimaryButton onClick={() => setShowCreate((value) => !value)}>New enquiry</PrimaryButton>}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-900">{success}</p>}
      {showCreate && <Panel title="New enquiry" className="mb-6"><p className="mb-4 text-sm text-[var(--muted)]">Create a distinct application. Exact duplicate active applications are prevented.</p><form onSubmit={create} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Destination country<input name="preferredCountry" required className="min-h-11 rounded-lg border px-3" /></label>
        <label className="grid gap-1 text-sm font-semibold">Institution<input name="institution" className="min-h-11 rounded-lg border px-3" /></label>
        <label className="grid gap-1 text-sm font-semibold">Course or programme<input name="program" className="min-h-11 rounded-lg border px-3" /></label>
        <label className="grid gap-1 text-sm font-semibold">Study level<input name="preferredStudyLevel" className="min-h-11 rounded-lg border px-3" /></label>
        <label className="grid gap-1 text-sm font-semibold">Intended intake<input name="intendedIntake" className="min-h-11 rounded-lg border px-3" /></label>
        <div className="flex items-end gap-3"><PrimaryButton disabled={busy}>{busy ? "Creating…" : "Create enquiry"}</PrimaryButton><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 font-semibold">Cancel</button></div>
      </form></Panel>}
      <div role="tablist" aria-label="Application filters" className="mb-5 flex flex-wrap gap-2">{(["ACTIVE", "AWAITING", "COMPLETED", "DISCONTINUED", "ARCHIVED"] as Filter[]).map((value) => <button role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} key={value} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${filter === value ? "border-blue-500 bg-blue-50" : "bg-white"}`}>{label(value)}</button>)}</div>
      {loading ? <p role="status">Loading applications…</p> : filtered.length ? <div className="grid gap-4 lg:grid-cols-2">{filtered.map((application) => <article key={application._id} className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{application.preferredCountry || "Destination undecided"}</h2><p className="text-sm text-[var(--muted)]">{[application.institution, application.program, application.intendedIntake].filter(Boolean).join(" · ") || "Details to be confirmed"}</p></div><Badge>{label(application.stage)}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--muted)]">Counsellor</dt><dd className="font-semibold">{application.assignedCounsellorId?.fullName || "Unassigned"}</dd></div><div><dt className="text-[var(--muted)]">Checklist</dt><dd className="font-semibold">{application.checklist.filter((item) => item.status === "ACCEPTED").length}/{application.checklist.length} accepted</dd></div></dl><Link href={`/applications/${application._id}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--primary-hover)]">View application</Link></article>)}</div> : <EmptyState title={`No ${label(filter).toLowerCase()} applications`} description={applications.length ? "Choose another filter to view your applications." : "Use New enquiry to record your first application."} />}
    </AppShell>
  );
}
