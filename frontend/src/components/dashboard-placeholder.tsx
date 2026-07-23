import { Card, Status } from "./ui";
import { DashboardLayout } from "./dashboard-layout";

export function DashboardPlaceholder({ role }: { role: "Student" | "Counsellor" | "Administrator" }) {
  return <DashboardLayout role={role}><Status>Foundation placeholder</Status><h1 className="mt-5 text-3xl font-bold">{role} dashboard</h1><p className="mt-2 text-slate-600">Role-specific workflows will be implemented in a later stage.</p><Card className="mt-8"><h2 className="text-lg font-semibold">No application data yet</h2><p className="mt-2 text-slate-600">This stage intentionally contains no fake production records or business functionality.</p></Card></DashboardLayout>;
}
