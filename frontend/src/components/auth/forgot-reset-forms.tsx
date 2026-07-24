"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";
import {
  ErrorSummary,
  Field,
  PasswordField,
  PasswordStrength,
  SubmitButton,
} from "./form-controls";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>(
        "/api/v1/auth/forgot-password",
        { method: "POST", body: JSON.stringify({ email: data.get("email") }) },
      );
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email. The response is the same whether or not an account exists."
    >
      <Link
        href="/login"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-blue-700 underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Back to sign in
      </Link>
      <form className="mt-5 grid gap-5" onSubmit={submit}>
        <ErrorSummary message={error} />
        {message && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            {message}
          </p>
        )}
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <SubmitButton busy={busy}>Send reset instructions</SubmitButton>
      </form>
    </AuthShell>
  );
}
export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(!token);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
          passwordConfirmation: data.get("passwordConfirmation"),
        }),
      });
      window.history.replaceState({}, "", "/reset-password");
      router.replace("/login?success=password-reset");
    } catch (reason) {
      const caught = reason as Error & { code?: string };
      const invalid =
        caught.code === "INVALID_TOKEN" || caught.code === "PASSWORD_REUSED";
      setLinkInvalid(invalid);
      setError(
        caught.code === "PASSWORD_REUSED"
          ? "That password was used recently. Request a new reset link if you need to start again."
          : caught.code === "INVALID_TOKEN"
            ? "This reset link is invalid, expired, or has already been used."
            : "The password could not be reset. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Choose a new password"
      description="Your reset link is single-use and expires after 30 minutes."
    >
      <Link
        href="/login"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-blue-700 underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Back to sign in
      </Link>
      <form className="mt-5 grid gap-5" onSubmit={submit}>
        <ErrorSummary
          message={error || (!token ? "This reset link is incomplete." : "")}
        />
        {linkInvalid && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            Request a{" "}
            <Link href="/forgot-password" className="font-semibold underline">
              new password reset link
            </Link>{" "}
            to continue safely.
          </p>
        )}
        <PasswordField
          label="New password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={128}
          required
        />
        <PasswordStrength password={password} />
        <PasswordField
          label="Confirm new password"
          name="passwordConfirmation"
          maxLength={128}
          required
        />
        <SubmitButton busy={busy || !token}>Reset password</SubmitButton>
      </form>
    </AuthShell>
  );
}
