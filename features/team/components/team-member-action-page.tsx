'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import type { TeamMember } from '../data'

const actionCopy = {
  'change-team': { title: 'Change team', description: 'Move this member to another delivery team.' },
  'change-role': { title: 'Change role', description: 'Update this member’s delivery role.' },
  availability: { title: 'Update availability', description: 'Record lightweight delivery availability context.' },
} as const

export type TeamMemberMutation = keyof typeof actionCopy

export function TeamMemberActionPage({ member, action }: { member: TeamMember; action: TeamMemberMutation }) {
  const router = useRouter()
  const { organization } = useShellContext()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const copy = actionCopy[action]
  const returnHref = `/people/team/${member.id}`

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const values = Object.fromEntries(new FormData(event.currentTarget))
    sessionStorage.setItem(`unison:team-member-action:${organization.id}:${member.id}:${action}`, JSON.stringify(values))
    window.setTimeout(() => { setSaving(false); setDone(true) }, 350)
  }

  return <WorkPage category="People" title={copy.title} description={`${copy.description} Changes remain attributable to the current tenant workspace.`} parent={{ label: member.name, href: returnHref }} guidance={<><p className="font-semibold text-foreground">Accountability</p><p className="mt-2">Add a note that explains why this change is being made. It will provide context for the member’s activity history.</p></>}>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Change prepared</h2><p className="mt-2 text-sm text-muted-foreground">The current UI session now reflects this member update.</p><button type="button" onClick={() => router.push(returnHref)} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to profile</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card">
      <header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">Member update</p><h2 className="mt-2 text-lg font-semibold">{member.name}</h2></header>
      <div className="space-y-5 p-6 lg:p-8">
        {action === 'change-team' ? <Select name="team" label="Delivery team" value={member.team} options={['Business Solutions', 'Platform Engineering', 'Integration Services', 'Quality Assurance', 'Client Operations']} /> : null}
        {action === 'change-role' ? <Select name="role" label="Delivery role" value={member.role} options={['Delivery Manager', 'Project Manager', 'Business Analyst', 'Product Owner', 'Solution Architect', 'Technical Lead', 'Test Lead', 'Change Lead', 'Executive Sponsor']} /> : null}
        {action === 'availability' ? <><Select name="availability" label="Availability" value={member.availability} options={['Available', 'Partial', 'Busy', 'Unavailable']} /><Select name="reason" label="Reason" options={['Fully allocated', 'Temporary unavailability', 'Planned time away', 'Project commitment']} /></> : null}
        <label className="block text-sm font-medium">Notes<textarea name="notes" required rows={5} placeholder="Explain the context for this change" className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.push(returnHref)} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button></footer>
    </UnsavedForm>}
  </WorkPage>
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return <label className="block text-sm font-medium">{label}<select name={name} required defaultValue={value} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand">{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}
