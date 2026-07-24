import { Suspense } from "react";
import { AcceptCounsellorInvitation } from "@/components/auth/accept-counsellor-invitation";

export default function AcceptInvitationPage() {
  return <Suspense fallback={<p role="status">Loading invitation…</p>}><AcceptCounsellorInvitation /></Suspense>;
}
