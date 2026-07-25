import { StaffApplicationDetail } from "@/components/crm/staff-application-detail";
export default async function ManagedApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffApplicationDetail applicationId={id} role="COUNSELLOR" />;
}
