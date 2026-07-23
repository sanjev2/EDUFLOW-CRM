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
  async function changeStatus(user: User) { const status = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"; if (!window.confirm(`${status === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.fullName}?`)) return; const reason = window.prompt("Required audit reason"); if (!reason) return; await refreshCsrf(); await api(`/api/v1/admin/users/${user._id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }); await load(); }
  const filtered = users.filter((user) => `${user.fullName} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell role="ADMIN" title="Users" subtitle="Safe account administration with explicit status and role boundaries."><Panel title="User directory"><label className="mb-4 grid max-w-md gap-1 text-sm font-semibold">Search<input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-lg border px-3" /></label>{error && <p role="alert">{error}</p>}{filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Email</th><th className="p-3">MFA</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user) => <tr key={user._id} className="border-b"><td className="p-3 font-semibold">{user.fullName}</td><td className="p-3"><Badge>{user.role}</Badge></td><td className="p-3"><Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge></td><td className="p-3">{user.email}</td><td className="p-3">{user.mfaEnabled ? "Enabled" : "Not enabled"}</td><td className="p-3"><button onClick={() => void changeStatus(user)} className="font-semibold text-[var(--navy)]">{user.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></td></tr>)}</tbody></table></div> : <EmptyState title="No matching users" description="Change the search term to view other users." />}</Panel></AppShell>;
}
