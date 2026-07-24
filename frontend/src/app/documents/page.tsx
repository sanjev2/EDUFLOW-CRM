import { AppShell } from "@/components/app-shell";
import { DocumentWorkspace } from "@/components/documents/document-workspace";

export default function DocumentsPage() {
  return <AppShell role="STUDENT" title="Documents" subtitle="Upload and manage private documents connected to your EduFlow profile and application."><DocumentWorkspace role="STUDENT" /></AppShell>;
}
