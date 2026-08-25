import { TeamMemberProfile } from '@/features/team/components/team-member-profile'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <TeamMemberProfile memberId={employeeId} />
}
