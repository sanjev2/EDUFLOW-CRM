import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/forgot-reset-forms";
export default function ResetPasswordPage() { return <Suspense fallback={<p>Loading…</p>}><ResetPasswordForm /></Suspense>; }
