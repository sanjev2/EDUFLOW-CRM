"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

type User = { _id: string; fullName: string; email: string; role: string; status: string; emailVerifiedAt?: string; mfaEnabled: boolean };

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  async function load() {
    setUsers((await api<{ users: User[] }>("/api/v1/admin/users?limit=50")).users);
  }
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, []);
  useEffect(() => {
    if (!inviteOpen) return;
    nameInput.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !inviteBusy) closeInvite(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [inviteBusy, inviteOpen]);

  function openInvite() {
    setInviteError(""); setInviteSuccess(""); setInviteOpen(true);
  }
  function closeInvite() {
    setInviteOpen(false); setInviteError(""); setInviteSuccess("");
    window.setTimeout(() => addButton.current?.focus(), 0);
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setInviteBusy(true); setInviteError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await refreshCsrf();
      await api("/api/v1/admin/users/counsellors", { method: "POST", body: JSON.stringify({ fullName: data.get("fullName"), email: data.get("email") }) });
      setInviteSuccess("Counsellor account created. An invitation was emailed so they can verify their address and set a password.");
      form.reset();
      await load();
    } catch (reason) {
      const code = reason instanceof Error && "code" in reason ? String(reason.code) : "";
      const safeMessages: Record<string, string> = {
        ACCOUNT_EXISTS: "That email address is already registered.",
        COUNSELLOR_INVITATION_RATE_LIMITED: "Invitation requests are temporarily limited. Please wait and try again.",
        MFA_REQUIRED: "Administrator MFA verification is required. Sign in again and complete MFA.",
        ADMIN_MFA_ENROLMENT_REQUIRED: "Administrator MFA verification is required. Sign in again and complete MFA.",
        FRESH_AUTHENTICATION_REQUIRED: "Your administrator verification has expired. Sign in again and complete MFA.",
        EMAIL_DELIVERY_UNAVAILABLE: "Email delivery is temporarily unavailable. No counsellor account was created. Please try again later.",
        VALIDATION_ERROR: "Check the counsellor's full name and email address, then try again.",
      };
      setInviteError(safeMessages[code] ?? "The counsellor invitation could not be completed. Check the details and try again.");
    } finally {
      setInviteBusy(false);
    }
  }
  async function resendInvitation(user: User) {
    if (!window.confirm(`Resend the invitation for ${user.fullName}?`)) return;
    setError(""); setMessage("");
    try {
      await refreshCsrf();
      const result = await api<{ message: string }>(`/api/v1/admin/users/${user._id}/resend-invitation`, { method: "POST", body: "{}" });
      setMessage(result.message);
      await load();
    } catch {
      setError("The invitation request could not be completed. Please try again later.");
    }
  }
  async function changeStatus(user: User) {
    const status = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!window.confirm(`${status === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.fullName}?`)) return;
    const reason = window.prompt("Required audit reason");
    if (!reason) return;
    setError("");
    try {
      await refreshCsrf();
      await api(`/api/v1/admin/users/${user._id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account status could not be changed.");
    }
  }

  const filtered = users.filter((user) => `${user.fullName} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell role="ADMIN" title="Users" subtitle="Review account access, roles and security status." actions={<button ref={addButton} onClick={openInvite} className="min-h-11 rounded-xl bg-[var(--navy)] px-4 font-bold text-white shadow-sm hover:bg-blue-800">Add counsellor</button>}>
    <Panel title="User directory">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><label className="grid w-full max-w-md gap-1.5 text-sm font-semibold">Search users<input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-xl border border-[var(--border)] px-3" placeholder="Name, email or role" /></label><p className="text-sm text-[var(--muted)]">{filtered.length} of {users.length} accounts</p></div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr className="border-y bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]"><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Email verification</th><th className="p-3">MFA</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user) => <tr key={user._id} className="border-b hover:bg-slate-50/70"><td className="p-3"><p className="font-bold">{user.fullName}</p><p className="text-xs text-[var(--muted)]">{user.email}</p></td><td className="p-3"><Badge>{user.role}</Badge></td><td className="p-3"><Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge></td><td className="p-3"><Badge tone={user.emailVerifiedAt ? "success" : "warning"}>{user.emailVerifiedAt ? "VERIFIED" : "INVITATION PENDING"}</Badge></td><td className="p-3">{user.mfaEnabled ? "Enabled" : "Not enabled"}</td><td className="p-3 text-right"><div className="flex justify-end gap-2">{user.role === "COUNSELLOR" && !user.emailVerifiedAt && user.status === "ACTIVE" && <button onClick={() => void resendInvitation(user)} className="rounded-lg px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50">Resend invitation</button>}{user.role === "ADMIN" ? <span className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">Protected</span> : <button onClick={() => void changeStatus(user)} className="rounded-lg px-3 py-2 font-semibold text-[var(--navy)] hover:bg-blue-50">{user.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="No matching users" description="Change the search term to view other accounts." />}
    </Panel>
    {inviteOpen && <div className="fixed inset-0 z-50 grid place-items-center p-4"><button aria-label="Close invitation dialog" className="absolute inset-0 bg-slate-950/55" onClick={closeInvite} /><section role="dialog" aria-modal="true" aria-labelledby="invite-title" className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="invite-title" className="text-xl font-extrabold text-[var(--navy)]">Add counsellor</h2><p className="mt-2 text-sm text-[var(--muted)]">Counsellors are invited by an administrator and cannot register publicly.</p></div><button type="button" onClick={closeInvite} aria-label="Close" className="rounded-lg px-3 py-2 font-bold hover:bg-slate-100">×</button></div>{inviteSuccess ? <div className="mt-6"><p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{inviteSuccess}</p><button type="button" onClick={closeInvite} className="mt-5 min-h-11 rounded-lg bg-[var(--navy)] px-4 font-bold text-white">Close</button></div> : <form onSubmit={invite} className="mt-6 grid gap-4">{inviteError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{inviteError}</p>}<label className="grid gap-1.5 text-sm font-semibold">Full name<input ref={nameInput} name="fullName" required minLength={2} maxLength={100} autoComplete="name" className="min-h-11 rounded-lg border px-3" /></label><label className="grid gap-1.5 text-sm font-semibold">Email address<input name="email" type="email" required maxLength={254} autoComplete="email" className="min-h-11 rounded-lg border px-3" /></label><div className="mt-2 flex flex-wrap justify-end gap-3"><button type="button" onClick={closeInvite} disabled={inviteBusy} className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-60">Cancel</button><button disabled={inviteBusy} className="min-h-11 rounded-lg bg-[var(--navy)] px-4 font-bold text-white disabled:opacity-60">{inviteBusy ? "Sending invitation…" : "Create and send invitation"}</button></div></form>}</section></div>}
  </AppShell>;
}
