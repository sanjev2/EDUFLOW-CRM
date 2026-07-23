"use client";
import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

export function Field({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name;
  return <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>{label}<input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-help`} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal focus:border-blue-600" /><span id={`${id}-help`} className={`text-xs ${error ? "text-red-700" : "text-slate-500"}`}>{error ?? hint}</span></label>;
}
export function PasswordField(props: Omit<Parameters<typeof Field>[0], "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><Field {...props} type={visible ? "text" : "password"} /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-2 top-8 rounded p-1 text-slate-600">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
}
export function ErrorSummary({ message }: { message?: string }) {
  return message ? <div role="alert" aria-live="assertive" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div> : null;
}
export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{busy ? "Please wait…" : children}</button>;
}
export function PasswordStrength({ password }: { password: string }) {
  const rules = [
    [password.length >= 12, "12–128 characters"],
    [/[A-Z]/.test(password), "Uppercase"],
    [/[a-z]/.test(password), "Lowercase"],
    [/\d/.test(password), "Number"],
    [/[^A-Za-z0-9]/.test(password), "Special character"],
  ] as const;
  const met = rules.filter(([ok]) => ok).length;
  return <div aria-live="polite"><div className="h-1.5 overflow-hidden rounded bg-slate-200"><div className={`h-full ${met < 3 ? "bg-red-500" : met < 5 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${met * 20}%` }} /></div><ul className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-600">{rules.map(([ok, label]) => <li key={label} className={ok ? "text-emerald-700" : ""}>{ok ? "✓" : "○"} {label}</li>)}</ul></div>;
}
