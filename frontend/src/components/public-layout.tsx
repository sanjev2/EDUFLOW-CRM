import Link from "next/link";
import type { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen"><header className="border-b bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link className="text-xl font-bold text-blue-800" href="/">EduFlow</Link><div className="flex gap-4 text-sm font-semibold"><Link href="/login">Sign in</Link><Link href="/register">Register</Link></div></nav></header><main>{children}</main><footer className="mt-16 border-t px-5 py-8 text-center text-sm text-slate-600">EduFlow · Education consultancy workspace</footer></div>;
}
