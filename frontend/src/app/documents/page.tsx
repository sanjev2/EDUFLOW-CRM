import { AppShell } from "@/components/app-shell";
import { EmptyState, Panel } from "@/components/dashboard-ui";
export default function DocumentsPage() { return <AppShell role="STUDENT" title="Documents" subtitle="Secure document handling is intentionally isolated from this CRM stage."><Panel title="Document workspace"><EmptyState title="Documents will be added in the next secure workflow stage" description="No uploads are accepted yet. The future workflow will use private storage, validation and authorised delivery." /></Panel></AppShell>; }
