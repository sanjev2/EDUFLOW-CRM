"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Download, FileCheck2, Trash2, Upload } from "lucide-react";
import { api, downloadApi, refreshCsrf } from "@/lib/api";
import { Badge, EmptyState, Panel, PrimaryButton } from "../dashboard-ui";

type Role = "STUDENT" | "COUNSELLOR" | "ADMIN";
type DocumentItem = {
  id: string; ownerId: string; applicationId?: string; category: string; originalFilename: string;
  detectedMimeType: string; size: number; status: string; createdAt: string;
};
const categories = ["PASSPORT", "ACADEMIC_TRANSCRIPT", "ENGLISH_TEST", "FINANCIAL", "OTHER"] as const;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function DocumentWorkspace({ role, studentId }: { role: Role; studentId?: string }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [applicationId, setApplicationId] = useState<string>();
  const [applications, setApplications] = useState<{ _id: string; active?: boolean; archivedAt?: string; preferredCountry?: string; institution?: string; program?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const suffix = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
      const result = await api<{ documents: DocumentItem[] }>(`/api/v1/documents${suffix}`);
      setDocuments(result.documents);
      if (role === "STUDENT") {
        const applicationResult = await api<{ applications?: { _id: string; active?: boolean; archivedAt?: string; preferredCountry?: string; institution?: string; program?: string }[] }>("/api/v1/crm/applications/mine");
        const available = (applicationResult.applications ?? []).filter((item) => item.active && !item.archivedAt);
        setApplications(available); setApplicationId((current) => current && available.some((item) => item._id === current) ? current : available[0]?._id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Documents could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const suffix = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
    void api<{ documents: DocumentItem[] }>(`/api/v1/documents${suffix}`)
      .then(async (result) => {
        setDocuments(result.documents);
        if (role === "STUDENT") {
          const applicationResult = await api<{ applications?: { _id: string; active?: boolean; archivedAt?: string; preferredCountry?: string; institution?: string; program?: string }[] }>("/api/v1/crm/applications/mine");
          const available = (applicationResult.applications ?? []).filter((item) => item.active && !item.archivedAt);
          setApplications(available); setApplicationId(available[0]?._id);
        }
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [role, studentId]);

  function validate(file: File) {
    const parts = file.name.split(".");
    const extension = parts.length === 2 ? parts[1]?.toLowerCase() : "";
    const expected = extension === "pdf" ? "application/pdf" : ["jpg", "jpeg"].includes(extension ?? "") ? "image/jpeg" : extension === "png" ? "image/png" : "";
    if (!file.size) return "Choose a non-empty file.";
    if (file.size > 5 * 1024 * 1024) return "The file must be 5 MB or smaller.";
    if (!expected || !allowedTypes.has(file.type) || file.type !== expected) return "Choose a PDF, JPEG or PNG file with a matching extension.";
    return "";
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setUploadError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = selectedFile;
    const category = String(form.get("category") ?? "");
    if (!file) return setUploadError("Choose a file to upload.");
    const validation = validate(file);
    if (validation) return setUploadError(validation);
    setBusy(true);
    try {
      await refreshCsrf();
      await api("/api/v1/documents", {
        method: "POST", body: file,
        headers: {
          "content-type": file.type,
          "x-document-category": category,
          "x-file-name": encodeURIComponent(file.name),
          ...(applicationId ? { "x-application-id": applicationId } : {}),
        },
      });
      setMessage("Document uploaded securely.");
      setUploadError("");
      formElement.reset();
      setSelectedFile(undefined);
      await load();
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : "The document could not be uploaded.");
    } finally { setBusy(false); }
  }

  async function download(document: DocumentItem) {
    setError(""); setBusy(true);
    try {
      const blob = await downloadApi(`/api/v1/documents/${document.id}/download`);
      const temporaryUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = temporaryUrl; link.download = document.originalFilename; link.click();
      URL.revokeObjectURL(temporaryUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The document could not be downloaded.");
    } finally { setBusy(false); }
  }

  async function remove(document: DocumentItem) {
    if (!window.confirm(`Delete ${document.originalFilename}? This cannot be undone.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await refreshCsrf();
      await api(`/api/v1/documents/${document.id}`, { method: "DELETE" });
      setMessage("Document deleted.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The document could not be deleted.");
    } finally { setBusy(false); }
  }

  return <div className="grid gap-6">
    {role === "STUDENT" && <Panel title="Upload a document">
      <form onSubmit={upload} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        {applications.length > 0 && <label className="grid gap-1.5 text-sm font-semibold">Related application<select value={applicationId ?? ""} onChange={(event) => setApplicationId(event.target.value)} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3">{applications.map((application) => <option key={application._id} value={application._id}>{[application.preferredCountry, application.institution, application.program].filter(Boolean).join(" — ") || application._id}</option>)}</select></label>}
        <label className="grid gap-1.5 text-sm font-semibold">Document category<select name="category" required className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3">{categories.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-semibold">Select file<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { setSelectedFile(event.currentTarget.files?.[0]); setUploadError(""); }} className="min-h-11 rounded-lg border border-[var(--border)] bg-white p-2 text-sm" /></label>
        <PrimaryButton disabled={busy || !selectedFile} className="inline-flex items-center justify-center gap-2"><Upload aria-hidden size={18} />{busy ? "Uploading…" : "Upload"}</PrimaryButton>
      </form>
      {uploadError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{uploadError}</p>}
      <p className="mt-4 text-sm text-[var(--muted)]">PDF, JPEG or PNG only. Maximum 5 MB. Files are private and checked by type and file signature.</p>
    </Panel>}
    <Panel title={role === "ADMIN" ? "Document oversight" : "Documents"}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {loading ? <p role="status" className="py-8 text-center text-sm text-[var(--muted)]">Loading private documents…</p> : documents.length ? <ul className="divide-y divide-[var(--border)]">{documents.map((document) => <li key={document.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[var(--navy)]"><FileCheck2 aria-hidden size={20} /></span>
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{document.originalFilename}</p><p className="text-xs text-[var(--muted)]">{document.category.replaceAll("_", " ")} · {(document.size / 1024).toFixed(1)} KB · {new Date(document.createdAt).toLocaleDateString()}</p>{role === "ADMIN" && <p className="mt-1 break-all text-xs text-[var(--muted)]">Student ID: {document.ownerId}</p>}</div>
        <Badge tone="success">{document.status}</Badge>
        <button disabled={busy} onClick={() => void download(document)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--navy)] disabled:opacity-50"><Download aria-hidden size={16} />Download</button>
        {(role === "STUDENT" || role === "ADMIN") && <button disabled={busy} onClick={() => void remove(document)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 aria-hidden size={16} />Delete</button>}
      </li>)}</ul> : <EmptyState title="No documents yet" description={role === "STUDENT" ? "Upload a required document when it is ready." : "No private documents are available in this authorised context."} />}
    </Panel>
  </div>;
}
