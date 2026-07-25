import { StudentApplication } from "@/components/crm/student-application";
export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentApplication applicationId={id} />;
}
