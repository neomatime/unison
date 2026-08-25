import { TeamMemberForm } from '@/features/team/components/team-member-form'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <TeamMemberForm mode="edit" memberId={employeeId} />
}
