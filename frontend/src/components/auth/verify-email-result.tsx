"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";

export function VerifyEmailResult() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const verificationRequest = useRef<{ token: string; request: Promise<unknown> } | undefined>(undefined);
  const [state, setState] = useState<"pending" | "success" | "failure">(token ? "pending" : "failure");
  const [message, setMessage] = useState(token ? "Verifying your email…" : "The verification link is incomplete.");

  useEffect(() => {
    if (!token) return;
    if (!verificationRequest.current || verificationRequest.current.token !== token) {
      verificationRequest.current = {
        token,
        request: api("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
      };
    }
    let active = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    void verificationRequest.current.request
      .then(() => {
        if (!active) return;
        window.history.replaceState({}, "", "/verify-email");
        setState("success");
        setMessage("Email verified successfully. Redirecting to sign in.");
        redirectTimer = setTimeout(() => router.replace("/login?success=email-verified"), 1200);
      })
      .catch((error: Error) => {
        if (!active) return;
        setState("failure");
        setMessage(error.message);
      });
    return () => { active = false; if (redirectTimer) clearTimeout(redirectTimer); };
  }, [router, token]);

  return <AuthShell title="Email verification" description="Verification links are time-limited and single-use.">
    <p className={`mt-8 rounded-lg p-4 ${state === "success" ? "bg-emerald-50 text-emerald-900" : "bg-slate-50"}`} role="status">{message}</p>
    {state === "success" && <Link href="/login?success=email-verified" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800">Continue to sign in</Link>}
    {state === "failure" && <p className="mt-5 text-sm text-slate-600">Request a <Link className="font-semibold text-blue-700 underline" href="/resend-verification">new verification email</Link> if your link has expired or was already used.</p>}
  </AuthShell>;
}
