"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, SubmitButton } from "./form-controls";

export function ResendVerificationForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: form.get("email") }) });
      setMessage(result.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The request could not be completed.");
    } finally { setBusy(false); }
  }
  return <AuthShell title="Resend verification email" description="Enter the email used for registration. The response is the same for every account state.">
    <form onSubmit={submit} className="mt-8 grid gap-5">
      <ErrorSummary message={error} />
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <Field label="Email address" name="email" type="email" autoComplete="email" required />
      <SubmitButton busy={busy}>Send verification instructions</SubmitButton>
    </form>
    <p className="mt-6 text-sm text-slate-600"><Link className="font-semibold text-blue-700" href="/login">Return to sign in</Link></p>
  </AuthShell>;
}
