"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, refreshCsrf, setPendingMfaChallenge } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, PasswordField, SubmitButton } from "./form-controls";

type LoginResult = { mfaRequired?: boolean; challenge?: string; csrfToken?: string; mfaEnrollmentRequired?: boolean; user?: { role: string } };
const successMessages = {
  "email-verified": "Email verified successfully. You can now sign in.",
  "password-reset": "Password reset successful. Sign in with your new password.",
} as const;
export function LoginForm() {
  const router = useRouter();
  const success = useSearchParams().get("success");
  const confirmation = success && Object.hasOwn(successMessages, success) ? successMessages[success as keyof typeof successMessages] : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [captcha, setCaptcha] = useState<{ challengeId: string; prompt: string }>();
  async function authenticate(body: Record<string, unknown>) {
    try {
      return await api<LoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) });
    } catch (reason) {
      const caught = reason as Error & { code?: string };
      if (caught.code !== "CSRF_REJECTED") throw reason;
      await refreshCsrf();
      return api<LoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) });
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setVerificationRequired(false);
    const data = new FormData(event.currentTarget);
    try {
      const result = await authenticate({ email: data.get("email"), password: data.get("password"), captchaId: captcha?.challengeId, captchaAnswer: data.get("captchaAnswer") || undefined });
      if (result.mfaRequired && result.challenge) {
        setPendingMfaChallenge(result.challenge); router.push("/mfa-challenge");
      } else if (result.mfaEnrollmentRequired) router.push("/mfa-enrolment");
      else router.push(`/dashboard/${result.user?.role.toLowerCase() === "admin" ? "admin" : result.user?.role.toLowerCase()}`);
    } catch (reason: unknown) {
      const caught = reason as Error & { code?: string };
      setError(caught.code === "CSRF_REJECTED" ? "Your secure sign-in session could not be refreshed. Reload the page and try again." : caught.message);
      if (caught.code === "EMAIL_VERIFICATION_REQUIRED") setVerificationRequired(true);
      if (caught.code === "CAPTCHA_REQUIRED") setCaptcha(await api("/api/v1/auth/captcha", { method: "POST" }));
    } finally { setBusy(false); }
  }
  return <AuthShell title="Welcome back" description="Sign in to your secure EduFlow workspace.">
    <form onSubmit={submit} className="mt-8 grid gap-5" noValidate>
      {confirmation && <div role="status" className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p>{confirmation}</p><button type="button" aria-label="Dismiss confirmation" className="shrink-0 font-bold" onClick={() => router.replace("/login")}>×</button></div>}
      <ErrorSummary message={error} />
      {verificationRequired && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Your email must be verified before sign-in. <Link className="font-semibold underline" href="/resend-verification">Request a new verification email</Link>.</p>}
      <Field label="Email address" name="email" type="email" autoComplete="email" required />
      <PasswordField label="Password" name="password" autoComplete="current-password" maxLength={128} required />
      {captcha && <Field label={captcha.prompt} name="captchaAnswer" inputMode="numeric" required hint="This challenge expires and can be used once." />}
      <div className="flex justify-end"><Link className="text-sm font-semibold text-blue-700" href="/forgot-password">Forgot password?</Link></div>
      <SubmitButton busy={busy}>Sign in</SubmitButton>
    </form>
    <p className="mt-6 text-sm text-slate-600">New to EduFlow? <Link className="font-semibold text-blue-700" href="/register">Create a student account</Link></p>
  </AuthShell>;
}
