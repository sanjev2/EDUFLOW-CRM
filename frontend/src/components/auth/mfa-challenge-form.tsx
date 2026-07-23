"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, takePendingMfaChallenge } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, SubmitButton } from "./form-controls";

export function MfaChallengeForm() {
  const router = useRouter();
  const [challenge] = useState(() => takePendingMfaChallenge());
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(challenge ? "" : "Your sign-in challenge is missing or expired. Please sign in again.");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: { role: string } }>("/api/v1/mfa/login", { method: "POST", body: JSON.stringify({ challenge, code: data.get("code"), recovery }) });
      router.replace(`/dashboard/${result.user.role.toLowerCase()}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Verification failed."); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Verify it’s you" description={recovery ? "Enter one unused recovery code." : "Enter the six-digit code from your authenticator app."}><form className="mt-8 grid gap-5" onSubmit={submit}><ErrorSummary message={error} /><Field label={recovery ? "Recovery code" : "Authenticator code"} name="code" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" required /><SubmitButton busy={busy || !challenge}>Continue securely</SubmitButton><button type="button" onClick={() => setRecovery((value) => !value)} className="text-sm font-semibold text-blue-700">{recovery ? "Use authenticator code" : "Use a recovery code"}</button></form></AuthShell>;
}
