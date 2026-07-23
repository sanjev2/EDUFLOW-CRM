import { CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicLayout } from "../public-layout";
import { Card } from "../ui";
import type { ReactNode } from "react";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <PublicLayout><div className="bg-[var(--app-background)] px-5 py-10 sm:py-16"><div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-[0_24px_70px_rgb(4_56_115_/_0.12)] lg:grid-cols-[.82fr_1.18fr]">
    <aside className="relative hidden overflow-hidden bg-[var(--navy)] p-10 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--primary)]/20" /><div className="relative"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--navy)]"><ShieldCheck aria-hidden /></span><p className="mt-8 text-sm font-bold uppercase tracking-[.13em] text-[var(--light-blue)]">Your secure workspace</p><h2 className="mt-3 text-3xl font-extrabold leading-tight">Continue every student journey with confidence.</h2><p className="mt-4 leading-7 text-blue-100">Clear workflows and thoughtful safeguards help your team stay focused on student outcomes.</p></div><ul className="relative grid gap-4 text-sm">{["Role-aware access", "Protected account sessions", "Visible application progress"].map((item) => <li key={item} className="flex items-center gap-3"><CheckCircle2 aria-hidden className="text-[var(--primary)]" size={19} />{item}</li>)}</ul></aside>
    <Card className="border-0 p-6 shadow-none sm:p-10 lg:rounded-none"><div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[var(--navy)] lg:hidden"><ShieldCheck aria-hidden /></div><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--primary-hover)]">EduFlow account</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">{title}</h1><p className="mt-3 leading-7 text-[var(--muted)]">{description}</p>{children}</Card>
  </div></div></PublicLayout>;
}
