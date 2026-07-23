import type { ReactNode } from "react";
export function MetricCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return <section className="app-card group min-w-0 overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgb(4_56_115_/_0.09)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.07em] text-[var(--muted)]">{label}</p><p className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text)]">{value}</p>{hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}</div>{icon && <span className="rounded-xl bg-[var(--light-blue)]/55 p-3 text-[var(--navy)] transition group-hover:bg-[var(--light-blue)]">{icon}</span>}</div><div className="mt-4 h-1 w-12 rounded-full bg-[var(--primary)]" /></section>;
}
export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`app-card min-w-0 overflow-hidden p-5 sm:p-6 ${className}`}><div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4"><h2 className="text-lg font-extrabold tracking-tight text-[var(--text)]">{title}</h2>{action}</div>{children}</section>;
}
export function Badge({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warning" | "danger" }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold status-${tone}`}>{children}</span>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center"><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`min-h-11 rounded-[10px] bg-[var(--primary)] px-4 py-2 font-semibold text-[#043873] hover:bg-[var(--primary-hover)] hover:text-white disabled:opacity-50 ${props.className ?? ""}`}>{children}</button>;
}
