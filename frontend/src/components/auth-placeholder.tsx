import Link from "next/link";
import { PublicLayout } from "./public-layout";
import { Button, Card, Input } from "./ui";

export function AuthPlaceholder({ mode }: { mode: "login" | "register" }) {
  const login = mode === "login";
  return <PublicLayout><div className="mx-auto max-w-md px-5 py-16"><Card><h1 className="text-3xl font-bold">{login ? "Welcome back" : "Create your account"}</h1><p className="mt-2 text-slate-600">Interface placeholder — authentication is intentionally deferred.</p><form className="mt-8 grid gap-4"><Input label="Email address" name="email" type="email" autoComplete="email" disabled />{!login && <Input label="Full name" name="name" autoComplete="name" disabled />}<Input label="Password" name="password" type="password" autoComplete={login ? "current-password" : "new-password"} disabled /><Button type="button" disabled>{login ? "Sign in" : "Register"}</Button></form><p className="mt-6 text-sm text-slate-600">{login ? "New to EduFlow?" : "Already registered?"} <Link className="font-semibold text-blue-700" href={login ? "/register" : "/login"}>{login ? "Create account" : "Sign in"}</Link></p></Card></div></PublicLayout>;
}
