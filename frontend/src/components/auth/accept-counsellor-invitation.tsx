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
  const verificationToken = params.get("verification") ?? "";
  const setupToken = params.get("setup") ?? "";
  const verification = useRef<Promise<unknown> | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    !verificationToken || !setupToken
      ? "This invitation link is incomplete."
      : "",
  );

  useEffect(() => {
    if (!verificationToken || !setupToken) return;
    verification.current ??= api("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verificationToken }),
    });
    let active = true;
    void verification.current
      .then(() => {
        if (!active) return;
        window.history.replaceState({}, "", "/accept-invitation");
        setReady(true);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [setupToken, verificationToken]);

  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(() => router.replace("/login"), 2000);
    return () => clearTimeout(timer);
  }, [complete, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: setupToken,
          password,
          passwordConfirmation: data.get("passwordConfirmation"),
        }),
      });
      window.history.replaceState({}, "", "/accept-invitation");
      setComplete(true);
      setReady(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The invitation could not be completed.",
      );
      setBusy(false);
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
      {error && (
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
            href="/login"
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
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            Email verified. Set your password to finish accepting the
            invitation.
          </p>
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
