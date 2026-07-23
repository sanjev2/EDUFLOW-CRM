import { Suspense } from "react";
import { VerifyEmailResult } from "@/components/auth/verify-email-result";
export default function VerifyEmailPage() { return <Suspense fallback={<p>Loading…</p>}><VerifyEmailResult /></Suspense>; }
