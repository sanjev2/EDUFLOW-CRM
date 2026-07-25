"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import {
  ErrorSummary,
  PasswordField,
  PasswordStrength,
  SubmitButton,
} from "./form-controls";

export function AcceptCounsellorInvitation() {
  const params = useSearchParams();
  const router = useRouter();
  const [tokens] = useState(() => ({
    verification: params.get("verification") ?? "",
    setup: params.get("setup") ?? "",
  }));
  const verificationToken = tokens.verification;
  const setupToken = tokens.setup;
  const verification = useRef<Promise<unknown> | undefined>(undefined);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    !verificationToken || !setupToken
      ? "This invitation link is incomplete."
      : "",
  );

  useEffect(() => {
    if (!verificationToken || !setupToken) return;
    verification.current ??= api("/api/v1/auth/accept-invitation/verify", {
      method: "POST",
      body: JSON.stringify({
        verificationToken,
        setupToken,
      }),
    });
    let active = true;
    void verification.current
      .then(() => {
        if (!active) return;
        window.history.replaceState({}, "", "/accept-invitation");
        setReady(true);
      })
      .catch((reason: Error) => {
        if (active) {
          setReady(false);
          setError(invitationError(reason, "verify"));
        }
      });
    return () => {
      active = false;
    };
  }, [setupToken, verificationToken]);

  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(
      () => router.replace("/login?success=invitation-accepted"),
      2000,
    );
    return () => clearTimeout(timer);
  }, [complete, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    if (password !== passwordConfirmation) {
      setError("The passwords do not match.");
      return;
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: setupToken,
          password,
          passwordConfirmation,
        }),
      });
      window.history.replaceState({}, "", "/accept-invitation");
      setComplete(true);
      setReady(false);
    } catch (reason) {
      setError(invitationError(reason, "setup"));
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <AuthShell
      title="Accept counsellor invitation"
      description="Verify your invited email and choose a private password for your EduFlow account."
    >
      <div className="mt-8">
        <ErrorSummary message={error} />
      </div>
      <Link
        href="/login"
        className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Back to sign in
      </Link>
      {error && !ready && (
        <p className="mt-4 text-sm text-slate-600">
          If this invitation has expired or was already used, ask your
          administrator to resend it.
        </p>
      )}
      {complete && (
        <div
          className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-900"
          role="status"
        >
          <p>Your password is set. You can now sign in as a counsellor.</p>
          <Link
            href="/login?success=invitation-accepted"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Continue to sign in
          </Link>
        </div>
      )}
      {!error && !ready && (
        <p role="status" className="mt-6 rounded-lg bg-slate-50 p-4">
          Verifying your invitation…
        </p>
      )}
      {ready && (
        <form onSubmit={submit} className="mt-6 grid gap-5">
          {!error && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              Email verified. Set your password to finish accepting the
              invitation.
            </p>
          )}
          <PasswordField
            label="New password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            maxLength={128}
            required
          />
          <PasswordStrength password={password} />
          <PasswordField
            label="Confirm new password"
            name="passwordConfirmation"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            autoComplete="new-password"
            maxLength={128}
            required
          />
          <SubmitButton busy={busy}>Set password and continue</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

type SafeApiError = Error & { code?: string; details?: unknown };
const commonPasswordParts = ["password", "password123", "qwerty123", "letmein123", "admin123", "welcome123", "iloveyou"];

function passwordPolicyError(password: string) {
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return "Use 12–128 characters with uppercase and lowercase letters, a number, and a special character.";
  }
  if (commonPasswordParts.some((part) => password.toLowerCase().includes(part))) {
    return "Choose a less common password that does not contain common password terms.";
  }
  return "";
}

function invitationError(reason: unknown, phase: "verify" | "setup") {
  const error = reason as SafeApiError;
  if (error?.code === "INVALID_INVITATION" || error?.code === "INVALID_TOKEN") {
    return phase === "verify"
      ? "This invitation is invalid, expired, or has already been used. Ask your administrator to resend it."
      : "This password-setup link is invalid, expired, or has already been used. Ask your administrator to resend the invitation.";
  }
  if (error?.code === "PASSWORD_REUSED") {
    return "Choose a password you have not used recently.";
  }
  if (error?.code === "VALIDATION_ERROR") {
    return "Choose matching passwords with 12–128 characters, including uppercase and lowercase letters, a number, and a special character. Avoid common passwords.";
  }
  return "The invitation could not be completed right now. Please try again.";
}
