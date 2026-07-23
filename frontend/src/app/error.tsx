"use client";
import { Button } from "@/components/ui";
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="grid min-h-screen place-items-center p-5"><div className="text-center"><h1 className="text-3xl font-bold">Something went wrong</h1><p className="my-4 text-slate-600">The page could not be displayed.</p><Button onClick={reset}>Try again</Button></div></main>; }
