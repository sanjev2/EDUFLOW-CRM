import { ShieldCheck } from "lucide-react";
import { PublicLayout } from "../public-layout";
import { Card } from "../ui";
import type { ReactNode } from "react";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <PublicLayout><div className="mx-auto max-w-lg px-5 py-12"><Card><div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck aria-hidden /></div><h1 className="text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 leading-6 text-slate-600">{description}</p>{children}</Card></div></PublicLayout>;
}
