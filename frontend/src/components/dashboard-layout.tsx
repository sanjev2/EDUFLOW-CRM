import { GraduationCap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardLayout({ role, children }: { role: string; children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 md:grid md:grid-cols-[240px_1fr]"><aside className="bg-slate-950 p-5 text-white"><Link className="flex items-center gap-2 text-xl font-bold" href="/"><GraduationCap aria-hidden /> EduFlow</Link><p className="mt-8 text-sm text-slate-300">{role} workspace</p></aside><main className="p-5 md:p-10">{children}</main></div>;
}
