"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, PasswordField, PasswordStrength, SubmitButton } from "./form-controls";

export function RegisterForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ fullName: data.get("fullName"), email: data.get("email"), password, passwordConfirmation: data.get("passwordConfirmation"), consent: data.get("consent") === "on" }) });
      setSuccess(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Registration could not be completed."); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Create your student account" description="Start securely with a verified email address. Staff accounts are created by an administrator.">{success ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-900" role="status">Check the development outbox or your email for verification instructions.</div> : <form onSubmit={submit} className="mt-8 grid gap-5" noValidate><ErrorSummary message={error} /><Field label="Full name" name="fullName" autoComplete="name" required /><Field label="Email address" name="email" type="email" autoComplete="email" required /><PasswordField label="Password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /><PasswordStrength password={password} /><PasswordField label="Confirm password" name="passwordConfirmation" autoComplete="new-password" maxLength={128} required /><label className="flex gap-3 text-sm"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4" /><span>I agree to the privacy notice and terms for using EduFlow.</span></label><SubmitButton busy={busy}>Create account</SubmitButton></form>}<p className="mt-6 text-sm text-slate-600">Already registered? <Link className="font-semibold text-blue-700" href="/login">Sign in</Link></p></AuthShell>;
}
