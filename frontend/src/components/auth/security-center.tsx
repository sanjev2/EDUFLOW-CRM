"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, refreshCsrf } from "@/lib/api";
import { DashboardLayout } from "../dashboard-layout";
import { Card } from "../ui";
import { ErrorSummary, PasswordField, PasswordStrength, SubmitButton } from "./form-controls";

type Session = { id: string; createdAt: string; lastActivityAt: string; expiresAt: string; userAgent: string; ipAddress: string; current: boolean };
export function SecurityCenter() {
  const router = useRouter(); const [sessions, setSessions] = useState<Session[]>([]); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function load() { await refreshCsrf(); const result = await api<{ sessions: Session[] }>("/api/v1/sessions"); setSessions(result.sessions); }
  useEffect(() => {
    void refreshCsrf()
      .then(() => api<{ sessions: Session[] }>("/api/v1/sessions"))
      .then((result) => setSessions(result.sessions))
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function revoke(id: string) { setError(""); try { await api(`/api/v1/sessions/${id}`, { method: "DELETE" }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Session could not be revoked."); } }
  async function logout() { await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); router.replace("/login"); }
  async function changePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); const data = new FormData(event.currentTarget); try { const result = await api<{ message: string }>("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: data.get("currentPassword"), password, passwordConfirmation: data.get("passwordConfirmation") }) }); setMessage(result.message); } catch (reason) { setError(reason instanceof Error ? reason.message : "Password could not be changed."); } finally { setBusy(false); } }
  return <DashboardLayout role="Security"><div className="mx-auto max-w-4xl"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Security settings</h1><p className="mt-2 text-slate-600">Manage your password, MFA and active sessions.</p></div><button onClick={() => void logout()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold">Log out</button></div><ErrorSummary message={error} />{message && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}<div className="mt-8 grid gap-6"><Card><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Multi-factor authentication</h2><p className="mt-1 text-sm text-slate-600">Protect sign-in with an authenticator and recovery codes.</p></div><button onClick={() => router.push("/mfa-enrolment")} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Set up MFA</button></div></Card><Card><h2 className="text-xl font-bold">Change password</h2><form onSubmit={changePassword} className="mt-5 grid gap-4"><PasswordField label="Current password" name="currentPassword" autoComplete="current-password" required /><PasswordField label="New password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /><PasswordStrength password={password} /><PasswordField label="Confirm new password" name="passwordConfirmation" autoComplete="new-password" maxLength={128} required /><SubmitButton busy={busy}>Change password</SubmitButton></form></Card><Card><h2 className="text-xl font-bold">Active sessions</h2><div className="mt-4 grid gap-3">{sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-semibold">{session.current ? "This device" : session.userAgent}</p><p className="text-xs text-slate-500">Last active {new Date(session.lastActivityAt).toLocaleString()} · IP {session.ipAddress}</p></div>{!session.current && <button onClick={() => void revoke(session.id)} className="text-sm font-semibold text-red-700">Revoke</button>}</div>)}</div></Card></div></div></DashboardLayout>;
}
