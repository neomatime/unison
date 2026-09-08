import { notFound } from 'next/navigation'

import { TeamMemberActionPage, type TeamMemberMutation } from '@/features/team/components/team-member-action-page'
import { teamMembers } from '@/features/team/data'

const actions: TeamMemberMutation[] = ['change-team', 'change-role', 'availability']

export default async function Page({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ action?: string }> }) {
  const [{ memberId }, { action }] = await Promise.all([params, searchParams])
  const member = teamMembers.find((item) => item.id === memberId)
  if (!member || !actions.includes(action as TeamMemberMutation)) notFound()
  return <TeamMemberActionPage member={member} action={action as TeamMemberMutation} />
}
