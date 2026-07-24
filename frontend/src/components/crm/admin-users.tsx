"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../app-shell";
import { Badge, EmptyState, Panel } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";

type User = { _id: string; fullName: string; email: string; role: string; status: string; emailVerifiedAt?: string; mfaEnabled: boolean };
export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]); const [search, setSearch] = useState(""); const [error, setError] = useState("");
  async function load() { setUsers((await api<{ users: User[] }>("/api/v1/admin/users?limit=50")).users); }
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, []);
  async function changeStatus(user: User) {
    const status = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!window.confirm(`${status === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.fullName}?`)) return;
    const reason = window.prompt("Required audit reason");
    if (!reason) return;
    setError("");
    try { await refreshCsrf(); await api(`/api/v1/admin/users/${user._id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The account status could not be changed."); }
  }
  const filtered = users.filter((user) => `${user.fullName} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell role="ADMIN" title="Users" subtitle="Review account access, roles and security status.">
    <Panel title="User directory">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><label className="grid w-full max-w-md gap-1.5 text-sm font-semibold">Search users<input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-xl border border-[var(--border)] px-3" placeholder="Name, email or role" /></label><p className="text-sm text-[var(--muted)]">{filtered.length} of {users.length} accounts</p></div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-y bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]"><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Email</th><th className="p-3">MFA</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user) => <tr key={user._id} className="border-b hover:bg-slate-50/70"><td className="p-3 font-bold">{user.fullName}</td><td className="p-3"><Badge>{user.role}</Badge></td><td className="p-3"><Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge></td><td className="p-3 text-[var(--muted)]">{user.email}</td><td className="p-3">{user.mfaEnabled ? "Enabled" : "Not enabled"}</td><td className="p-3 text-right">{user.role === "ADMIN" ? <span className="text-xs font-semibold text-[var(--muted)]">Protected</span> : <button onClick={() => void changeStatus(user)} className="rounded-lg px-3 py-2 font-semibold text-[var(--navy)] hover:bg-blue-50">{user.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="No matching users" description="Change the search term to view other accounts." />}
    </Panel>
  </AppShell>;
}
