"use client";
import { useEffect, useState } from "react";
import { Download, FileJson2, Upload } from "lucide-react";
import { AppShell, type AppRole } from "../app-shell";
import { Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";
import { apiUrl } from "@/lib/config";

type Preview = { schemaVersion: string; fields: string[]; fieldCount: number; confirmationRequired: boolean };
type Identity = { user: { role: AppRole } };

export function PrivacyCenter() {
  const [role, setRole] = useState<AppRole>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState<Record<string, unknown>>();
  const [preview, setPreview] = useState<Preview>();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    void api<Identity>("/api/v1/auth/me").then((result) => setRole(result.user.role)).catch((reason: Error) => setError(reason.message));
  }, []);

  async function downloadExport() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/privacy/export`, { credentials: "include", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Your data export could not be prepared.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eduflow-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your data export was downloaded.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your data export could not be prepared."); }
    finally { setBusy(false); }
  }

  async function selectImport(file?: File) {
    setError(""); setMessage(""); setPreview(undefined); setCandidate(undefined); setConfirmed(false);
    if (!file) return;
    if (file.size > 100 * 1024) return setError("Choose a JSON file that is 100 KB or smaller.");
    if (file.type && file.type !== "application/json") return setError("Choose a JSON profile file.");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      setCandidate(parsed as Record<string, unknown>);
    } catch { setError("The selected file does not contain valid JSON."); }
  }

  async function previewImport() {
    if (!candidate) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await refreshCsrf();
      const result = await api<Preview>("/api/v1/privacy/import/preview", { method: "POST", body: JSON.stringify(candidate) });
      setPreview(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The profile import could not be previewed."); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!candidate || !confirmed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await refreshCsrf();
      const result = await api<{ message: string }>("/api/v1/privacy/import", { method: "POST", body: JSON.stringify({ ...candidate, confirm: true }) });
      setMessage(result.message);
      setCandidate(undefined); setPreview(undefined); setConfirmed(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The profile import could not be completed."); }
    finally { setBusy(false); }
  }

  if (!role) return <main className="grid min-h-screen place-items-center bg-[var(--app-background)] p-5"><p role={error ? "alert" : "status"} className="rounded-xl bg-white p-5 shadow-sm">{error || "Loading privacy controls…"}</p></main>;
  return <AppShell role={role} title="Privacy & data" subtitle="Download your EduFlow information and manage safe profile portability.">
    <div className="mx-auto grid max-w-5xl gap-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <Panel title="Download my data">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-sm text-[var(--muted)]">Includes your account details, appropriate profile and workflow records, document metadata and relevant account-event names.</p><p className="mt-2 text-sm text-[var(--muted)]">Excludes passwords, sessions, MFA secrets, recovery codes, security tokens, private storage details and document file contents.</p></div><PrimaryButton disabled={busy} onClick={() => void downloadExport()} className="inline-flex items-center justify-center gap-2"><Download aria-hidden size={18} />Download my data</PrimaryButton></div>
      </Panel>
      {role === "STUDENT" && <Panel title="Import editable profile fields">
        <div className="grid gap-4">
          <p className="text-sm text-[var(--muted)]">JSON only, maximum 100 KB. The versioned file may contain only fields already editable on your student profile. It cannot change your email, role, password, verification, MFA, account status, applications, assignments or documents.</p>
          <label className="grid gap-1.5 text-sm font-semibold">Profile JSON file<input aria-describedby="privacy-import-policy" type="file" accept=".json,application/json" onChange={(event) => void selectImport(event.currentTarget.files?.[0])} className="min-h-11 rounded-lg border border-[var(--border)] bg-white p-2 text-sm" /></label>
          <p id="privacy-import-policy" className="text-xs text-[var(--muted)]">Your file is validated in memory and is not placed in browser storage.</p>
          <div><PrimaryButton disabled={busy || !candidate} onClick={() => void previewImport()} className="inline-flex items-center gap-2"><FileJson2 aria-hidden size={18} />Preview import</PrimaryButton></div>
          {preview && <section aria-labelledby="import-preview-title" className="rounded-xl border border-[var(--border)] bg-slate-50 p-4"><h3 id="import-preview-title" className="font-bold">Import preview</h3><p className="mt-1 text-sm text-[var(--muted)]">{preview.fieldCount} validated fields: {preview.fields.join(", ") || "none"}.</p><label className="mt-4 flex items-start gap-3 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} className="mt-1" />I confirm that these profile fields should replace the corresponding values in my account.</label><PrimaryButton disabled={busy || !confirmed} onClick={() => void confirmImport()} className="mt-4 inline-flex items-center gap-2"><Upload aria-hidden size={18} />Confirm import</PrimaryButton></section>}
        </div>
      </Panel>}
    </div>
  </AppShell>;
}
