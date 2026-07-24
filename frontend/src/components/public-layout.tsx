"use client";

import { GraduationCap, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const links = [
  ["Product", "/#product"],
  ["Workflow", "/#workflow"],
  ["Automations", "/#automations"],
  ["Security", "/#security"],
] as const;

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return <div className="min-h-screen bg-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--navy)] text-white shadow-sm">
      <nav aria-label="Main navigation" className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link className="flex items-center gap-2 text-xl font-extrabold tracking-tight" href="/">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary)] text-[var(--navy)]"><GraduationCap aria-hidden size={21} /></span>
          EduFlow
        </Link>
        <div className="hidden items-center gap-7 text-sm font-semibold lg:flex">
          {links.map(([label, href]) => <Link key={href} className="text-blue-50 transition hover:text-[var(--light-blue)]" href={href}>{label}</Link>)}
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          <Link className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/10" href="/login">Sign in</Link>
          <Link className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-[var(--navy)] transition hover:bg-white" href="/register">Get started</Link>
        </div>
        <button ref={trigger} aria-expanded={open} aria-controls="mobile-navigation" aria-label="Open navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)}><Menu /></button>
      </nav>
      {open && <div className="fixed inset-0 z-50 lg:hidden">
        <button className="absolute inset-0 bg-slate-950/60" aria-label="Close navigation overlay" onClick={() => setOpen(false)} />
        <div id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className="absolute right-0 flex h-full w-[min(88vw,360px)] flex-col bg-white p-5 text-[var(--text)] shadow-2xl">
          <div className="flex items-center justify-between border-b pb-5"><span className="font-extrabold text-[var(--navy)]">Explore EduFlow</span><button ref={closeButton} aria-label="Close navigation" className="rounded-lg p-2" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X /></button></div>
          <div className="grid gap-1 py-5">{links.map(([label, href]) => <Link key={href} className="rounded-xl px-3 py-3 font-semibold hover:bg-blue-50" href={href} onClick={() => setOpen(false)}>{label}</Link>)}</div>
          <div className="mt-auto grid gap-3"><Link className="rounded-xl border border-[var(--border)] px-4 py-3 text-center font-bold" href="/login">Sign in</Link><Link className="rounded-xl bg-[var(--primary)] px-4 py-3 text-center font-bold text-[var(--navy)]" href="/register">Get started</Link></div>
        </div>
      </div>}
    </header>
    <main>{children}</main>
    <footer className="bg-[#022b59] px-5 py-12 text-blue-100">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div><Link className="flex items-center gap-2 text-xl font-extrabold text-white" href="/"><GraduationCap aria-hidden />EduFlow</Link><p className="mt-4 max-w-sm text-sm leading-6">A focused, secure workspace for Nepal&apos;s education consultancies and the students they guide.</p></div>
        <div><p className="font-bold text-white">Product</p><div className="mt-4 grid gap-3 text-sm"><Link href="/#workflow">How it works</Link><Link href="/#security">Security</Link><Link href="/login">Sign in</Link></div></div>
        <div><p className="font-bold text-white">Get started</p><div className="mt-4 grid gap-3 text-sm"><Link href="/register">Create student account</Link><Link href="/forgot-password">Reset password</Link></div></div>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/15 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} EduFlow. Education consultancy workspace.</span><span>Verified access, protected sessions and accountable activity.</span></div>
    </footer>
  </div>;
}
