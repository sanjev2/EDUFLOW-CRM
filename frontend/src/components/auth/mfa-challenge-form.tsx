"use client";
import Link from "next/link";
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
  const [error, setError] = useState(
    challenge
      ? ""
      : "Your sign-in challenge is missing or expired. Please sign in again.",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: { role: string } }>(
        "/api/v1/mfa/login",
        {
          method: "POST",
          body: JSON.stringify({ challenge, code: data.get("code"), recovery }),
        },
      );
      router.replace(`/dashboard/${result.user.role.toLowerCase()}`);
    } catch (reason) {
      const caught = reason as Error & { code?: string };
      const safeMessage = caught.code === "INVALID_MFA_CODE"
        ? "The verification code is invalid. Check the current code and try again."
        : caught.code === "INVALID_MFA_CHALLENGE"
          ? "Your MFA challenge expired or was already used. Sign in again."
          : caught.code === "TOO_MANY_ATTEMPTS"
            ? "MFA verification is temporarily rate-limited. Wait and sign in again."
            : caught.code === "MFA_REENROLMENT_REQUIRED"
              ? "MFA configuration requires secure re-enrolment. Use a recovery code, or reset your password to continue securely."
              : "MFA verification is temporarily unavailable. Please sign in and try again.";
      setError(
        safeMessage,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Verify it’s you"
      description={
        recovery
          ? "Enter one unused recovery code."
          : "Enter the six-digit code from your authenticator app."
      }
    >
      <form className="mt-8 grid gap-5" onSubmit={submit}>
        <ErrorSummary message={error} />
        <Field
          label={recovery ? "Recovery code" : "Authenticator code"}
          name="code"
          inputMode={recovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
        />
        <SubmitButton busy={busy || !challenge}>Continue securely</SubmitButton>
        <button
          type="button"
          onClick={() => setRecovery((value) => !value)}
          className="text-sm font-semibold text-blue-700"
        >
          {recovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-blue-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
