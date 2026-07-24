"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, PasswordField, PasswordStrength, SubmitButton } from "./form-controls";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { const result = await api<{ message: string }>("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: data.get("email") }) }); setMessage(result.message); } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); } finally { setBusy(false); } }
  return <AuthShell title="Reset your password" description="Enter your email. The response is the same whether or not an account exists."><form className="mt-8 grid gap-5" onSubmit={submit}><ErrorSummary message={error} />{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}<Field label="Email address" name="email" type="email" autoComplete="email" required /><SubmitButton busy={busy}>Send reset instructions</SubmitButton></form></AuthShell>;
}
export function ResetPasswordForm() {
  const params = useSearchParams(); const router = useRouter(); const token = params.get("token") ?? ""; const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { await api<{ message: string }>("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, passwordConfirmation: data.get("passwordConfirmation") }) }); window.history.replaceState({}, "", "/reset-password"); router.replace("/login?success=password-reset"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Reset failed."); setBusy(false); } }
  return <AuthShell title="Choose a new password" description="Your reset link is single-use and expires after 30 minutes."><form className="mt-8 grid gap-5" onSubmit={submit}><ErrorSummary message={error || (!token ? "This reset link is incomplete." : "")} /><PasswordField label="New password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required /><PasswordStrength password={password} /><PasswordField label="Confirm new password" name="passwordConfirmation" maxLength={128} required /><SubmitButton busy={busy || !token}>Reset password</SubmitButton></form></AuthShell>;
}
