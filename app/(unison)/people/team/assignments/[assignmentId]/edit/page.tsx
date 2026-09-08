import { TeamAssignmentPage } from '@/features/team/components/team-assignment-page'
import { projectAssignments } from '@/features/team/data'

export default async function Page({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const assignment = projectAssignments.find((item) => item.id === assignmentId)
  return <TeamAssignmentPage assignment={assignment} assignmentId={assignmentId} />
}
