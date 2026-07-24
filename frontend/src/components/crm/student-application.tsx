"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

const stages = ["ENQUIRY", "COUNSELLING", "DOCUMENTS_PENDING", "APPLICATION_SUBMITTED", "DECISION_RECEIVED", "COMPLETED"];
type Receipt = { reference: string; submittedAt: string; integrity: string; stage: string };
type Data = {
  application: null | { _id: string; stage: string; submission?: Receipt };
  history: { _id: string; newStage: string; reason: string; createdAt: string }[];
  assignment: null | { counsellorId: { fullName: string; email: string } };
};

export function StudentApplication() {
  const [data, setData] = useState<Data>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt>();
  const submissionKey = useRef("");

  async function load() {
    setData(await api<Data>("/api/v1/crm/applications/current"));
  }
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await refreshCsrf();
      await api("/api/v1/crm/applications", {
        method: "POST",
        body: JSON.stringify({
          preferredCountry: form.get("preferredCountry") || undefined,
          preferredStudyLevel: form.get("preferredStudyLevel") || undefined,
          intendedIntake: form.get("intendedIntake") || undefined,
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enquiry could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this application? This action is recorded.")) return;
    const reason = window.prompt("Please provide a short reason.");
    if (!reason) return;
    await refreshCsrf();
    await api("/api/v1/crm/applications/current/cancel", { method: "POST", body: JSON.stringify({ reason }) });
    await load();
  }

  async function submitApplication() {
    if (!window.confirm("Submit this application for consultancy processing? Check your profile and documents before continuing.")) return;
    setBusy(true);
    setError("");
    try {
      await refreshCsrf();
      submissionKey.current ||= crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const result = await api<{ receipt: Receipt }>("/api/v1/crm/applications/current/submit", {
        method: "POST",
        headers: { "idempotency-key": submissionKey.current },
        body: JSON.stringify({ confirm: true }),
      });
      setReceipt(result.receipt);
      submissionKey.current = "";
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Application could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  const shownReceipt = receipt ?? data?.application?.submission;
  return (
    <AppShell role="STUDENT" title="My application" subtitle="Follow your enquiry from first contact to decision.">
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {shownReceipt && (
        <section role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
          <p className="font-bold">Application submitted securely</p>
          <p className="mt-1 text-sm">Reference: <span className="font-mono">{shownReceipt.reference}</span></p>
          <time className="text-sm">{new Date(shownReceipt.submittedAt).toLocaleString()}</time>
        </section>
      )}
      {!data ? <p role="status">Loading application…</p> : !data.application ? (
        <Panel title="Create your first enquiry">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold">Preferred country<input name="preferredCountry" className="min-h-11 rounded-lg border px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Study level<input name="preferredStudyLevel" className="min-h-11 rounded-lg border px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Intended intake<input name="intendedIntake" className="min-h-11 rounded-lg border px-3" /></label>
            <PrimaryButton className="md:col-span-3 md:justify-self-start" disabled={busy}>{busy ? "Creating…" : "Create enquiry"}</PrimaryButton>
          </form>
        </Panel>
      ) : (
        <div className="grid gap-6">
          <Panel title="Current application" action={<Badge>{data.application.stage.replaceAll("_", " ")}</Badge>}>
            <div className="grid gap-5">
              <ol aria-label="Application stages" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {stages.map((stage) => {
                  const reached = stages.indexOf(stage) <= stages.indexOf(data.application!.stage);
                  return <li key={stage} className={`rounded-lg border p-3 text-xs font-semibold ${reached ? "border-blue-400 bg-blue-50 text-[var(--navy)]" : "text-[var(--muted)]"}`}>{stage.replaceAll("_", " ")}</li>;
                })}
              </ol>
              {data.application.stage === "DOCUMENTS_PENDING" && <PrimaryButton disabled={busy} onClick={() => void submitApplication()}>{busy ? "Submitting…" : "Submit application"}</PrimaryButton>}
              {["ENQUIRY", "COUNSELLING", "DOCUMENTS_PENDING"].includes(data.application.stage) && <button onClick={() => void cancel()} className="justify-self-start text-sm font-semibold text-red-700">Cancel application</button>}
            </div>
          </Panel>
          <Panel title="Assigned counsellor">
            {data.assignment ? <div><p className="font-bold">{data.assignment.counsellorId.fullName}</p><p className="text-sm text-[var(--muted)]">{data.assignment.counsellorId.email}</p></div> : <EmptyState title="Currently unassigned" description="Your enquiry remains active. An administrator has been alerted to arrange support." />}
          </Panel>
          <Panel title="Stage history">
            {data.history.length ? <ol className="relative space-y-4 border-l-2 border-blue-100 pl-5">{data.history.map((item) => <li key={item._id}><p className="font-semibold">{item.newStage.replaceAll("_", " ")}</p><p className="text-sm text-[var(--muted)]">{item.reason}</p><time className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol> : <EmptyState title="No history yet" description="Application changes will appear here." />}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
