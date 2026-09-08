import { projectAssignments } from './data'

export type TeamAssignment = (typeof projectAssignments)[number]

export function teamAssignmentStorageKey(organizationId: string) {
  return `unison:team-assignments:${organizationId}`
}

export function readTeamAssignments(organizationId: string): TeamAssignment[] {
  const stored = sessionStorage.getItem(teamAssignmentStorageKey(organizationId))
  if (!stored) return projectAssignments
  try {
    return JSON.parse(stored) as TeamAssignment[]
  } catch {
    return projectAssignments
  }
}

export function writeTeamAssignments(organizationId: string, assignments: TeamAssignment[]) {
  sessionStorage.setItem(teamAssignmentStorageKey(organizationId), JSON.stringify(assignments))
}
