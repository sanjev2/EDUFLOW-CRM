"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell } from "./auth-shell";

export function VerifyEmailResult() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState(token ? "Verifying your email…" : "The verification link is incomplete.");
  useEffect(() => { if (token) void api("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }).then(() => setState("Your email is verified. You can now sign in.")).catch((error: Error) => setState(error.message)); }, [token]);
  return <AuthShell title="Email verification" description="Verification links are time-limited and single-use."><p className="mt-8 rounded-lg bg-slate-50 p-4" role="status">{state}</p><Link href="/login" className="mt-6 inline-block font-semibold text-blue-700">Continue to sign in</Link></AuthShell>;
}
