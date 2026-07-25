import { StaffApplicationDetail } from "@/components/crm/staff-application-detail";
export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffApplicationDetail applicationId={id} role="ADMIN" />;
}
