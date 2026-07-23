import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50 ${props.className ?? ""}`} />;
}

export function Input({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = props.id ?? props.name;
  return <label className="grid gap-2 text-sm font-medium" htmlFor={id}>{label}<input {...props} id={id} className={`rounded-lg border border-slate-300 bg-white px-3 py-2 ${props.className ?? ""}`} /></label>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

export function Status({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800">{children}</span>;
}
