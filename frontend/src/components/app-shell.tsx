"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, BriefcaseBusiness, ClipboardList, FileClock, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { api, refreshCsrf } from "@/lib/api";

export type AppRole = "STUDENT" | "COUNSELLOR" | "ADMIN";
type ShellUser = { id: string; fullName: string; email: string; role: AppRole; status: string; mfaEnabled: boolean };
const navigation = {
  STUDENT: [
    ["Dashboard", "/dashboard/student", LayoutDashboard], ["My Profile", "/profile", UserRound],
    ["My Application", "/application", FileText], ["Documents", "/documents", BookOpen], ["Security", "/security", ShieldCheck],
  ],
  COUNSELLOR: [
    ["Dashboard", "/dashboard/counsellor", LayoutDashboard], ["Assigned Students", "/students", Users],
    ["Tasks", "/tasks", ClipboardList], ["Security", "/security", ShieldCheck],
  ],
  ADMIN: [
    ["Dashboard", "/dashboard/admin", LayoutDashboard], ["Users", "/admin/users", Users],
    ["Assignments", "/admin/assignments", BriefcaseBusiness], ["Documents", "/admin/documents", BookOpen], ["Audit Logs", "/admin/audit-logs", FileClock],
    ["Security Alerts", "/admin/security-alerts", AlertTriangle], ["Security", "/security", ShieldCheck],
  ],
} as const;
const roleNames: Record<AppRole, string> = { STUDENT: "Student", COUNSELLOR: "Counsellor", ADMIN: "Administrator" };

export function AppShell({ role, title, subtitle, actions, children }: { role: AppRole; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [drawer, setDrawer] = useState(false); const [user, setUser] = useState<ShellUser>(); const [loggingOut, setLoggingOut] = useState(false); const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void api<{ user: ShellUser; passwordExpired: boolean; mfaComplete: boolean }>("/api/v1/auth/me")
      .then((result) => {
        if (result.user.status !== "ACTIVE") return router.replace("/login");
        if (result.passwordExpired) return router.replace("/password-expired");
        if (result.user.role !== role) return router.replace("/access-denied");
        if (role === "ADMIN" && !result.user.mfaEnabled) return router.replace("/mfa-enrolment");
        if (role === "ADMIN" && !result.mfaComplete) return router.replace("/login");
        setUser(result.user);
      })
      .catch(() => router.replace("/login"));
  }, [role, router]);
  useEffect(() => { if (!drawer) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawer(false); menuButton.current?.focus(); } }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [drawer]);
  async function logout() { setLoggingOut(true); try { await refreshCsrf(); await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); router.replace("/login"); } finally { setLoggingOut(false); } }
  const initials = user?.fullName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || role[0];
  const sidebar = <><div className="border-b border-white/10 px-5 py-5"><div className="flex items-center justify-between"><Link href="/" className="flex items-center gap-3 font-extrabold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--navy)]"><GraduationCap aria-hidden size={22} /></span><span>EduFlow</span></Link><button aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setDrawer(false)}><X /></button></div><p className="mt-4 text-[11px] font-bold uppercase tracking-[.12em] text-[var(--light-blue)]">{roleNames[role]} workspace</p></div><nav aria-label={`${role.toLowerCase()} navigation`} className="flex-1 space-y-1.5 px-3 py-5">{navigation[role].map(([label, href, Icon]) => { const active = pathname === href; return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setDrawer(false)} className={`group relative flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? "bg-[var(--light-blue)] text-[var(--navy)] shadow-sm" : "text-blue-50 hover:bg-white/10 hover:text-white"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-white text-[var(--navy)]" : "text-blue-100 group-hover:bg-white/10"}`}><Icon aria-hidden size={18} /></span><span>{label}</span>{active && <span aria-hidden className="absolute -left-1 h-7 w-1 rounded-full bg-[var(--primary)]" />}</Link>; })}</nav><div className="border-t border-white/10 p-3"><button disabled={loggingOut} onClick={() => void logout()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-blue-50 hover:bg-white/10 disabled:opacity-60"><span className="grid h-8 w-8 place-items-center"><LogOut aria-hidden size={18} /></span>{loggingOut ? "Signing out…" : "Logout"}</button></div></>;
  return <div className="min-h-screen bg-[var(--app-background)] md:grid md:grid-cols-[252px_1fr]"><aside className="hidden min-h-screen bg-[linear-gradient(180deg,#043873_0%,#032f62_100%)] text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">{sidebar}</aside>{drawer && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" aria-label="Close navigation overlay" onClick={() => setDrawer(false)} /><aside role="dialog" aria-modal="true" aria-label="Navigation menu" className="relative flex h-full w-[min(86vw,310px)] flex-col bg-[var(--navy)] text-white shadow-2xl">{sidebar}</aside></div>}<div className="min-w-0"><header className="sticky top-0 z-30 flex min-h-18 items-center gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur md:px-6"><button ref={menuButton} aria-label="Open navigation" className="rounded-lg p-2 hover:bg-slate-100 md:hidden" onClick={() => setDrawer(true)}><Menu /></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-[var(--navy)]">{title}</p><p className="hidden text-xs text-[var(--muted)] sm:block">{roleNames[role]} workspace</p></div><div className="hidden min-w-0 text-right sm:block"><p className="max-w-52 truncate text-sm font-bold text-[var(--text)]">{user?.fullName || roleNames[role]}</p><p className="max-w-52 truncate text-xs text-[var(--muted)]">{user?.email || "Loading account…"}</p></div><div aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--light-blue)] text-sm font-extrabold text-[var(--navy)]">{initials}</div></header><main className="mx-auto w-full max-w-[1500px] p-4 md:p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-1.5 text-xs font-extrabold uppercase tracking-[.1em] text-[var(--primary-hover)]">{roleNames[role]} portal</p><h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] md:text-3xl">{title}</h1>{subtitle && <p className="mt-1.5 max-w-3xl text-sm text-[var(--muted)] md:text-base">{subtitle}</p>}</div>{actions}</div>{children}</main></div></div>;
}
