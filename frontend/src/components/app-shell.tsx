"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, BookOpen, BriefcaseBusiness, ClipboardList, FileClock, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { api, refreshCsrf } from "@/lib/api";

export type AppRole = "STUDENT" | "COUNSELLOR" | "ADMIN";
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
    ["Assignments", "/admin/assignments", BriefcaseBusiness], ["Audit Logs", "/admin/audit-logs", FileClock],
    ["Security Alerts", "/admin/security-alerts", AlertTriangle], ["Security", "/security", ShieldCheck],
  ],
} as const;

export function AppShell({ role, title, subtitle, actions, children }: { role: AppRole; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [drawer, setDrawer] = useState(false); const [compact, setCompact] = useState(false); const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!drawer) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawer(false); menuButton.current?.focus(); } }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [drawer]);
  async function logout() { await refreshCsrf(); await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); router.replace("/login"); }
  const sidebar = <><div className="flex h-16 items-center justify-between border-b border-white/15 px-5"><Link href="/" className="flex items-center gap-2 font-bold"><GraduationCap aria-hidden />{!compact && "EduFlow"}</Link><button aria-label="Close navigation" className="rounded-lg p-2 md:hidden" onClick={() => setDrawer(false)}><X /></button></div><nav aria-label={`${role.toLowerCase()} navigation`} className="flex-1 space-y-1 p-3">{navigation[role].map(([label, href, Icon]) => <Link key={href} href={href} title={label} onClick={() => setDrawer(false)} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${pathname === href ? "bg-white text-[#043873]" : "text-blue-50 hover:bg-white/10"}`}><Icon aria-hidden size={19} />{!compact && <span>{label}</span>}</Link>)}</nav><button onClick={() => void logout()} className="m-3 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-blue-50 hover:bg-white/10"><LogOut aria-hidden size={19} />{!compact && "Logout"}</button></>;
  return <div className={`min-h-screen bg-[var(--app-background)] md:grid ${compact ? "md:grid-cols-[80px_1fr]" : "md:grid-cols-[248px_1fr]"}`}><aside className="hidden min-h-screen bg-[var(--navy)] text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">{sidebar}</aside>{drawer && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-slate-950/50" aria-label="Close navigation overlay" onClick={() => setDrawer(false)} /><aside role="dialog" aria-modal="true" aria-label="Navigation menu" className="relative flex h-full w-[min(82vw,300px)] flex-col bg-[var(--navy)] text-white">{sidebar}</aside></div>}<div className="min-w-0"><header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-white px-4 md:px-6"><button ref={menuButton} aria-label="Open navigation" className="rounded-lg p-2 md:hidden" onClick={() => setDrawer(true)}><Menu /></button><button aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} className="hidden rounded-lg p-2 text-slate-600 md:block" onClick={() => setCompact((value) => !value)}>{compact ? <PanelLeftOpen /> : <PanelLeftClose />}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--navy)]">{title}</p></div><button aria-label="Notifications" className="rounded-lg p-2 text-slate-600"><Bell /></button><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--light-blue)] text-sm font-bold text-[var(--navy)]">{role[0]}</div></header><main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-[var(--muted)] md:text-base">{subtitle}</p>}</div>{actions}</div>{children}</main></div></div>;
}
