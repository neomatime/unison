'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { WorkPage } from '@/components/shared/work-page'
import { readTeamAssignments, type TeamAssignment } from '../assignment-storage'

export function TeamAssignmentDetailPage({ assignmentId, initialAssignment }: { assignmentId: string; initialAssignment?: TeamAssignment }) {
  const { organization } = useShellContext()
  const [assignment, setAssignment] = useState(initialAssignment)

  useEffect(() => {
    if (!initialAssignment) setAssignment(readTeamAssignments(organization.id).find((item) => item.id === assignmentId))
  }, [assignmentId, initialAssignment, organization.id])

  if (!assignment) return <WorkPage category="People" title="Assignment unavailable" description="This assignment is not available in the current tenant session." parent={{ label: 'Team', href: '/people/team?tab=assignments' }}><section className="border border-border bg-card p-8"><p className="text-sm text-muted-foreground">Return to Team and select an available project assignment.</p></section></WorkPage>

  const values = [['Member', assignment.member], ['Project', assignment.project], ['Role', assignment.role], ['Team', assignment.team], ['Allocation', `${assignment.allocation}%`], ['Start date', assignment.start], ['End date', assignment.end], ['Status', assignment.status]]
  return <WorkPage category="People" title={`${assignment.member} · ${assignment.project}`} description="Project assignment and delivery allocation." parent={{ label: 'Team', href: '/people/team?tab=assignments' }}>
    <section className="border border-border bg-card"><header className="flex items-center justify-between border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">Project assignment</p><Link href={`/people/team/assignments/${assignment.id}/edit`} className="bg-brand px-4 py-2 text-sm font-semibold text-white">Edit assignment</Link></header><dl className="grid sm:grid-cols-2">{values.map(([label, value]) => <div key={label} className="border-b border-border p-6 sm:odd:border-r"><dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</dt><dd className="mt-2 text-sm font-semibold">{value}</dd></div>)}</dl></section>
  </WorkPage>
}
