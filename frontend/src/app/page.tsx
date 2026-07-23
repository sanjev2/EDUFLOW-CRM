import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, Status } from "@/components/ui";
import { PublicLayout } from "@/components/public-layout";

export default function Home() {
  return <PublicLayout><div className="mx-auto max-w-6xl px-5 py-20"><Status>Secure foundation in progress</Status><div className="mt-6 grid items-center gap-10 md:grid-cols-2"><div><h1 className="text-4xl font-bold tracking-tight md:text-6xl">A clearer path from enquiry to enrolment.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">EduFlow brings students and education-consultancy teams into one focused, secure workspace.</p><Link className="mt-8 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white" href="/register">Get started <ArrowRight aria-hidden size={18} /></Link></div><Card className="bg-blue-950 text-white"><ShieldCheck aria-hidden className="text-blue-300" size={42} /><h2 className="mt-5 text-2xl font-bold">Security-led by design</h2><p className="mt-3 leading-7 text-blue-100">The backend remains the security boundary, with validation, constrained origins and structured error handling established from day one.</p></Card></div></div></PublicLayout>;
}
