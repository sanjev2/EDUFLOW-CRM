import { AppShell } from "@/components/app-shell";
import { DocumentWorkspace } from "@/components/documents/document-workspace";

export default function AdminDocumentsPage() {
  return <AppShell role="ADMIN" title="Documents" subtitle="Review private document metadata and retrieve files through authenticated, audited access."><DocumentWorkspace role="ADMIN" /></AppShell>;
}
