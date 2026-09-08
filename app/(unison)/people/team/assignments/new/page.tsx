import { TeamAssignmentPage } from '@/features/team/components/team-assignment-page'

export default async function Page({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const { member } = await searchParams
  return <TeamAssignmentPage defaultMemberId={member} />
}
