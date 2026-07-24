import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
export default function PasswordExpiredPage() {
  return (
    <AuthShell
      title="Password update required"
      description="Your password has reached its configured 90-day lifetime."
    >
      <p className="mt-6 text-slate-700">
        Verify your current password and choose a new one from Security
        settings.
      </p>
      <Link
        className="mt-5 inline-block font-semibold text-blue-700"
        href="/security"
      >
        Open Security settings
      </Link>
      <Link
        className="ml-5 mt-5 inline-block font-semibold text-blue-700 underline"
        href="/login"
      >
        Return to sign in
      </Link>
    </AuthShell>
  );
}
