import { DocumentWorkspace } from "@/components/documents/document-workspace";
import { AppShell } from "@/components/app-shell";

export default async function AssignedStudentDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell role="COUNSELLOR" title="Student documents" subtitle="Private documents for this assigned student. Access is verified by the server for every request."><DocumentWorkspace role="COUNSELLOR" studentId={id} /></AppShell>;
}
