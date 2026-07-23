"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, setPendingMfaChallenge } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import { ErrorSummary, Field, PasswordField, SubmitButton } from "./form-controls";

type LoginResult = { mfaRequired?: boolean; challenge?: string; csrfToken?: string; mfaEnrollmentRequired?: boolean; user?: { role: string } };
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState<{ challengeId: string; prompt: string }>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<LoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password"), captchaId: captcha?.challengeId, captchaAnswer: data.get("captchaAnswer") || undefined }) });
      if (result.mfaRequired && result.challenge) {
        setPendingMfaChallenge(result.challenge);
        router.push("/mfa-challenge");
      } else if (result.mfaEnrollmentRequired) router.push("/mfa-enrolment");
      else router.push(`/dashboard/${result.user?.role.toLowerCase() === "admin" ? "admin" : result.user?.role.toLowerCase()}`);
    } catch (reason: unknown) {
      const caught = reason as Error & { code?: string };
      setError(caught.message);
      if (caught.code === "CAPTCHA_REQUIRED") setCaptcha(await api("/api/v1/auth/captcha", { method: "POST" }));
    } finally { setBusy(false); }
  }
  return <AuthShell title="Welcome back" description="Sign in to your secure EduFlow workspace."><form onSubmit={submit} className="mt-8 grid gap-5" noValidate><ErrorSummary message={error} /><Field label="Email address" name="email" type="email" autoComplete="email" required /><PasswordField label="Password" name="password" autoComplete="current-password" maxLength={128} required />{captcha && <Field label={captcha.prompt} name="captchaAnswer" inputMode="numeric" required hint="This challenge expires and can be used once." />}<div className="flex justify-end"><Link className="text-sm font-semibold text-blue-700" href="/forgot-password">Forgot password?</Link></div><SubmitButton busy={busy}>Sign in</SubmitButton></form><p className="mt-6 text-sm text-slate-600">New to EduFlow? <Link className="font-semibold text-blue-700" href="/register">Create a student account</Link></p></AuthShell>;
}
