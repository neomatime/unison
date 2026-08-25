'use client'

import { ArrowLeft, CheckCircle2, LoaderCircle, Send, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'

import { deliveryRoles, deliveryTeams, teamMembers } from '../data'

export function TeamMemberForm({ mode, memberId }: { mode: 'invite' | 'edit'; memberId?: string }) {
  const member = teamMembers.find((item) => item.id === memberId)
  const [state, setState] = useState<'ready' | 'saving' | 'success' | 'error'>('ready')
  const [validation, setValidation] = useState('')
  const title = mode === 'invite' ? 'Invite Member' : `Edit ${member?.name ?? 'Member'}`

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    if (!values.firstName?.trim() || !values.lastName?.trim() || !values.email?.includes('@')) {
      setValidation('Enter a first name, last name and valid work email.')
      return
    }
    setValidation('')
    setState('saving')
    window.setTimeout(() => setState(values.email.endsWith('@error.example') ? 'error' : 'success'), 700)
  }

  if (state === 'success') return <>
    <WorkspaceHeader category="People" title={title} parent={{ label: 'Team', href: '/people/team' }} description={mode === 'invite' ? 'Establish delivery ownership and initial access.' : 'Update delivery role and organisation context.'} />
    <section className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-card p-12 text-center shadow-sm"><span className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success"><CheckCircle2 className="size-7" /></span><h2 className="mt-5 text-xl font-bold">{mode === 'invite' ? 'Invitation prepared' : 'Member updated'}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{mode === 'invite' ? 'The member now appears in the Team directory with an Invited status.' : 'The member profile now reflects the updated delivery and organisation details.'}</p><div className="mt-6 flex gap-2"><Link href="/people/team" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">Return to Team</Link>{mode === 'edit' && member ? <Link href={`/people/team/${member.id}`} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">View Profile</Link> : null}</div></section>
  </>

  return <>
    <WorkspaceHeader category="People" title={title} parent={{ label: 'Team', href: '/people/team' }} description={mode === 'invite' ? 'Invite a delivery participant and define their accountability context.' : 'Update delivery role, team and account context.'} actions={<Link href={member ? `/people/team/${member.id}` : '/people/team'} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold"><ArrowLeft className="size-4" />Cancel</Link>} />
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
      <FormSection title="Member Information" description="Core identity and work contact details."><div className="grid gap-5 sm:grid-cols-2"><Field name="firstName" label="First Name" required defaultValue={member?.name.split(' ')[0]} /><Field name="lastName" label="Last Name" required defaultValue={member?.name.split(' ').slice(1).join(' ')} /><Field name="email" label="Work Email" type="email" required defaultValue={member?.email} /><Field name="jobTitle" label="Job Title" required defaultValue={member?.title} /></div></FormSection>
      <FormSection title="Role & Organisation" description="Place the member within delivery accountability structures."><div className="grid gap-5 sm:grid-cols-2"><SelectField name="department" label="Department" values={['Delivery', 'Operations', 'Commercial', 'Finance', 'Executive']} defaultValue={member?.department} /><SelectField name="team" label="Team" values={deliveryTeams.map((item) => item.name)} defaultValue={member?.team} /><SelectField name="role" label="Role" values={deliveryRoles.map((item) => item.name)} defaultValue={member?.role} /><SelectField name="manager" label="Manager" values={teamMembers.filter((item) => item.status === 'Active').map((item) => item.name)} defaultValue={member?.manager} /></div></FormSection>
      <FormSection title="Access & Initial Assignment" description="Set the account role and an optional first project commitment."><div className="grid gap-5 sm:grid-cols-2"><SelectField name="accessRole" label="Access Role" values={['Member', 'Admin', 'Owner']} defaultValue={member?.accessRole} /><SelectField name="project" label="Initial Project Assignment (optional)" values={['No initial assignment', 'Claims Automation', 'Client Onboarding', 'Policy Modernisation', 'Document Hub']} /><SelectField name="status" label="Account Status" values={mode === 'invite' ? ['Invited'] : ['Active', 'Inactive', 'Invited']} defaultValue={member?.status} /><label className="text-sm font-medium">Accountability Note<textarea name="note" rows={3} placeholder="Add useful context for the Team activity history" className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-brand" /></label></div></FormSection>
      {validation ? <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{validation}</p> : null}
      {state === 'error' ? <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4"><p className="text-sm font-semibold text-danger">The member could not be saved.</p><p className="mt-1 text-xs text-muted-foreground">Review the details and try again. No changes were made.</p></div> : null}
      <footer className="sticky bottom-4 z-20 flex items-center justify-between rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur"><p className="hidden text-xs text-muted-foreground sm:block">Required fields are marked with an asterisk.</p><div className="ml-auto flex gap-2"><Link href={member ? `/people/team/${member.id}` : '/people/team'} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">Cancel</Link><button type="submit" disabled={state === 'saving'} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{state === 'saving' ? <LoaderCircle className="size-4 animate-spin" /> : mode === 'invite' ? <Send className="size-4" /> : <UserRound className="size-4" />}{state === 'saving' ? 'Saving…' : mode === 'invite' ? 'Send Invite' : 'Save Changes'}</button></div></footer>
    </form>
  </>
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-6">{children}</div></section> }
function Field({ name, label, type = 'text', required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) { return <label className="text-sm font-medium">{label}{required ? <span className="text-danger"> *</span> : null}<input name={name} type={type} required={required} defaultValue={defaultValue} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" /></label> }
function SelectField({ name, label, values, defaultValue }: { name: string; label: string; values: string[]; defaultValue?: string }) { return <label className="text-sm font-medium">{label}<select name={name} defaultValue={defaultValue} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand">{values.map((value) => <option key={value} value={value === 'No initial assignment' ? '' : value}>{value}</option>)}</select></label> }
