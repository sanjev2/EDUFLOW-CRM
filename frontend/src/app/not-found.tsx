import Link from "next/link";
export default function NotFound() { return <main className="grid min-h-screen place-items-center p-5"><div className="text-center"><p className="font-semibold text-blue-700">404</p><h1 className="mt-2 text-4xl font-bold">Page not found</h1><Link className="mt-6 inline-block font-semibold text-blue-700" href="/">Return home</Link></div></main>; }
