'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import { readTeamAssignments, type TeamAssignment, writeTeamAssignments } from '../assignment-storage'
import { deliveryRoles, teamMembers } from '../data'

export function TeamAssignmentPage({ assignment: initialAssignment, assignmentId, defaultMemberId }: { assignment?: TeamAssignment; assignmentId?: string; defaultMemberId?: string }) {
  const router = useRouter()
  const { organization } = useShellContext()
  const [assignment, setAssignment] = useState(initialAssignment)
  const [saving, setSaving] = useState(false)
  const defaultMember = teamMembers.find((member) => member.id === (assignment?.memberId ?? defaultMemberId))

  useEffect(() => {
    if (!initialAssignment && assignmentId) setAssignment(readTeamAssignments(organization.id).find((item) => item.id === assignmentId))
  }, [assignmentId, initialAssignment, organization.id])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const id = assignment?.id ?? `assignment-${Date.now()}`
    const member = teamMembers.find((item) => item.name === values.member)
    const next: TeamAssignment = {
      id,
      memberId: member?.id ?? assignment?.memberId ?? '',
      member: values.member,
      project: values.project,
      role: values.role,
      team: member?.team ?? assignment?.team ?? 'Unassigned',
      allocation: Number(values.allocation),
      start: values.start,
      end: values.end,
      status: values.status,
    }
    const current = readTeamAssignments(organization.id)
    writeTeamAssignments(organization.id, [...current.filter((item) => item.id !== id), next])
    window.setTimeout(() => router.push('/people/team?tab=assignments'), 350)
  }

  return <WorkPage category="People" title={assignment ? 'Edit project assignment' : 'Assign member'} description="Capture delivery ownership, role, allocation and assignment dates in one governed workspace." parent={{ label: 'Team', href: '/people/team' }} guidance={<><p className="font-semibold text-foreground">Allocation guidance</p><p className="mt-2">Review the member’s current capacity before confirming an allocation. Values above 100% should be treated as an overload risk.</p></>}>
    <UnsavedForm onSubmit={submit} className="border border-border bg-card">
      <header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">Project assignment</p><h2 className="mt-2 text-lg font-semibold">Assignment details</h2></header>
      <div className="grid gap-5 p-6 sm:grid-cols-2 lg:p-8">
        <Select label="Member" name="member" values={teamMembers.map((member) => member.name)} value={assignment?.member ?? defaultMember?.name} />
        <Select label="Project" name="project" values={['Claims Automation', 'Client Onboarding', 'Policy Modernisation', 'Vendor Integration', 'Document Hub']} value={assignment?.project} />
        <Select label="Delivery role" name="role" values={deliveryRoles.map((role) => role.name)} value={assignment?.role ?? defaultMember?.role} />
        <Field label="Allocation %" name="allocation" type="number" value={String(assignment?.allocation ?? 25)} />
        <Field label="Start date" name="start" type="date" value={assignment?.start} />
        <Field label="End date" name="end" type="date" value={assignment?.end} />
        <Select label="Status" name="status" values={['Active', 'Planned', 'Complete']} value={assignment?.status} />
        <label className="sm:col-span-2 text-sm font-medium">Notes<textarea name="notes" rows={4} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.push('/people/team')} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : assignment ? 'Save assignment' : 'Assign member'}</button></footer>
    </UnsavedForm>
  </WorkPage>
}

function Select({ label, name, values, value }: { label: string; name: string; values: string[]; value?: string }) { return <label className="text-sm font-medium">{label}<select name={name} defaultValue={value} required className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand">{values.map((item) => <option key={item}>{item}</option>)}</select></label> }
function Field({ label, name, type, value }: { label: string; name: string; type: string; value?: string }) { return <label className="text-sm font-medium">{label}<input name={name} type={type} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 150 : undefined} required defaultValue={value} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label> }
