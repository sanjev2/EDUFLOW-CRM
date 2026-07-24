"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, refreshCsrf } from "@/lib/api";

type Detail = {
  user: {
    id: string; fullName: string; email: string; role: string; status: string; emailVerified: boolean;
    mfaEnabled: boolean; createdAt: string; lastAuthenticatedAt?: string; passwordExpired: boolean;
  };
  summary: {
    activeSessions: number; documentCount: number; caseload: number;
    assignment?: { counsellor?: { fullName?: string; email?: string } } | null;
    application?: { stage: string; active: boolean } | null;
  };
  recentEvents: Array<{ id: string; event: string; createdAt: string }>;
};

const safeActionMessages: Record<string, string> = {
  ACCOUNT_HAS_DEPENDENCIES: "This established account cannot be permanently removed. Archive it instead.",
  COUNSELLOR_HAS_CASELOAD: "Resolve or reassign this counsellor's caseload first.",
  LAST_ADMIN_PROTECTED: "The last active administrator is protected.",
  SELF_ARCHIVE_DENIED: "You cannot archive your current administrator account.",
  INVITATION_NOT_CANCELLABLE: "Only an unused pending counsellor invitation can be cancelled.",
  ACCOUNT_ARCHIVED: "Archived accounts cannot be reactivated from this screen.",
};

export function AdminUserDetail({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setDetail(await api<Detail>(`/api/v1/admin/users/${userId}`));
  }, [userId]);
  useEffect(() => { void load().catch(() => setError("User details could not be loaded.")); }, [load]);
  useEffect(() => {
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, onClose]);

  async function action(name: string, path: string, method: string, body: Record<string, unknown>) {
    setBusy(name); setError(""); setMessage("");
    try {
      await refreshCsrf();
      const result = await api<{ message?: string }>(path, { method, body: JSON.stringify(body) });
      setMessage(result.message ?? "Account updated.");
      setConfirmation("");
      await onChanged();
      if (name === "cancel" || name === "remove") {
        onClose();
        return;
      }
      await load();
    } catch (caught) {
      const code = caught instanceof Error && "code" in caught ? String(caught.code) : "";
      setError(safeActionMessages[code] ?? "The account action could not be completed safely.");
    } finally { setBusy(""); }
  }

  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action("name", `/api/v1/admin/users/${userId}/profile`, "PATCH", { fullName: data.get("fullName"), reason: data.get("nameReason") });
  }

  const user = detail?.user;
  const pendingCounsellor = user?.role === "COUNSELLOR" && !user.emailVerified && !user.lastAuthenticatedAt;
  const validReason = reason.trim().length >= 10;
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="user-detail-title" className="my-6 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="user-detail-title" className="text-xl font-extrabold text-[var(--navy)]">User details</h2><p className="text-sm text-[var(--muted)]">Security-safe account information and lifecycle actions.</p></div>
        <button ref={closeButton} onClick={onClose} disabled={Boolean(busy)} className="rounded-lg px-3 py-2 font-semibold hover:bg-slate-100">Close</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {!detail ? <p role="status" className="mt-6">Loading user details…</p> : <>
        <div className="mt-6 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Name" value={user!.fullName} /><Info label="Email" value={user!.email} /><Info label="Role" value={user!.role} />
          <Info label="Status" value={user!.status} /><Info label="Email verification" value={user!.emailVerified ? "Verified" : "Pending"} />
          <Info label="MFA" value={user!.mfaEnabled ? "Enabled" : "Not enabled"} />
          <Info label="Created" value={formatDate(user!.createdAt)} /><Info label="Last successful login" value={user!.lastAuthenticatedAt ? formatDate(user!.lastAuthenticatedAt) : "Never"} />
          <Info label="Password" value={user!.passwordExpired ? "Expired" : "Current"} /><Info label="Active sessions" value={String(detail.summary.activeSessions)} />
          <Info label="Documents" value={String(detail.summary.documentCount)} /><Info label="Caseload" value={String(detail.summary.caseload)} />
          <Info label="Application" value={detail.summary.application?.stage ?? "None"} />
          <Info label="Assigned counsellor" value={detail.summary.assignment?.counsellor?.fullName ?? "None"} />
        </div>
        <form onSubmit={(event) => void updateName(event)} className="mt-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <h3 className="font-bold sm:col-span-2">Correct account name</h3>
          <label className="grid gap-1 text-sm font-semibold">Full name<input name="fullName" defaultValue={user!.fullName} required minLength={2} maxLength={100} className="min-h-11 rounded-lg border px-3" /></label>
          <label className="grid gap-1 text-sm font-semibold">Audit reason<input name="nameReason" required minLength={10} maxLength={500} className="min-h-11 rounded-lg border px-3" /></label>
          <button disabled={Boolean(busy)} className="min-h-11 rounded-lg bg-[var(--navy)] px-4 font-bold text-white disabled:opacity-50 sm:col-span-2">{busy === "name" ? "Saving…" : "Save name correction"}</button>
        </form>
        <div className="mt-5 rounded-xl border p-4">
          <h3 className="font-bold">Controlled account actions</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Permanent removal is available only for unused accounts. Established accounts must be archived to preserve audit and CRM integrity.</p>
          <label className="mt-3 grid gap-1 text-sm font-semibold">Mandatory audit reason<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} className="min-h-11 rounded-lg border px-3" /></label>
          <label className="mt-3 grid gap-1 text-sm font-semibold">Typed confirmation, when required<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 rounded-lg border px-3" placeholder="CANCEL INVITATION, REMOVE UNUSED STUDENT, or ARCHIVE ACCOUNT" /></label>
          <div className="mt-4 flex flex-wrap gap-2">
            {user!.status !== "ARCHIVED" && <button disabled={!validReason || Boolean(busy)} onClick={() => void action("status", `/api/v1/admin/users/${userId}/status`, "PATCH", { status: user!.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE", reason })} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{user!.status === "ACTIVE" ? "Suspend account" : "Reactivate account"}</button>}
            <button disabled={!validReason || Boolean(busy)} onClick={() => void action("sessions", `/api/v1/admin/users/${userId}/revoke-sessions`, "POST", { reason })} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">Revoke all sessions</button>
            {pendingCounsellor && <button disabled={Boolean(busy)} onClick={() => void action("resend", `/api/v1/admin/users/${userId}/resend-invitation`, "POST", {})} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">Resend invitation</button>}
            {pendingCounsellor && <button disabled={!validReason || confirmation !== "CANCEL INVITATION" || Boolean(busy)} onClick={() => void action("cancel", `/api/v1/admin/users/${userId}/pending-invitation`, "DELETE", { confirm: confirmation, reason })} className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Cancel pending invitation</button>}
            {user!.role === "STUDENT" && <button disabled={!validReason || confirmation !== "REMOVE UNUSED STUDENT" || Boolean(busy)} onClick={() => void action("remove", `/api/v1/admin/users/${userId}/unused-student`, "DELETE", { confirm: confirmation, reason })} className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Remove unused student</button>}
            <button disabled={!validReason || confirmation !== "ARCHIVE ACCOUNT" || Boolean(busy)} onClick={() => void action("archive", `/api/v1/admin/users/${userId}/archive`, "POST", { confirm: confirmation, reason })} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Archive account</button>
          </div>
        </div>
        <div className="mt-5 rounded-xl border p-4"><h3 className="font-bold">Recent audit activity</h3>{detail.recentEvents.length ? <ul className="mt-3 grid gap-2 text-sm">{detail.recentEvents.map((event) => <li key={event.id} className="flex justify-between gap-4 border-b pb-2"><span>{event.event.replaceAll("_", " ")}</span><time>{formatDate(event.createdAt)}</time></li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No recent account events.</p>}</div>
      </>}
    </section>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
