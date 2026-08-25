'use client'

import { CheckCircle2, LoaderCircle, UserPlus, X } from 'lucide-react'
import { useState } from 'react'

import type { TeamMember } from '../data'

export type MemberAction = 'assignments' | 'capacity' | 'change-team' | 'change-role' | 'assign-project' | 'availability' | null

export function InviteMemberDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (member: TeamMember) => void }) {
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form')
  const [error, setError] = useState('')
  if (!open) return null

  function resetAndClose() {
    setStatus('form')
    setError('')
    onClose()
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    if (!values.firstName?.trim() || !values.lastName?.trim() || !values.email?.includes('@')) {
      setError('Enter the member’s first name, last name and a valid work email.')
      return
    }
    setError('')
    setStatus('loading')
    window.setTimeout(() => {
      if (values.email.toLowerCase().endsWith('@error.example')) {
        setStatus('error')
        return
      }
      const name = `${values.firstName.trim()} ${values.lastName.trim()}`
      onInvited({ id: name.toLowerCase().replaceAll(' ', '-'), name, email: values.email, title: values.jobTitle || 'Team Member', role: values.role || 'Project Contributor', department: values.department || 'Delivery', team: values.team || 'Business Solutions', manager: values.manager || 'Amara Dlamini', projects: values.project ? 1 : 0, projectNames: values.project ? [values.project] : [], capacity: 0, availability: 'Available', availabilityNote: 'Invitation pending', status: 'Invited', accessRole: values.accessRole || 'Member', joined: 'Invited just now' })
      setStatus('success')
    }, 700)
  }

  return <div className="fixed inset-0 z-[80]" onMouseDown={resetAndClose}><div className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="invite-member-title" onMouseDown={(event) => event.stopPropagation()} className="absolute top-0 right-0 flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl">
    <header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold tracking-[0.12em] text-brand uppercase">Team access</p><h2 id="invite-member-title" className="mt-1 text-xl font-bold">Invite Member</h2><p className="mt-1 text-sm text-muted-foreground">Invite a delivery participant and establish their initial accountability.</p></div><button type="button" onClick={resetAndClose} aria-label="Close invite member" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></header>
    {status === 'success' ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success"><CheckCircle2 className="size-7" /></span><h3 className="mt-5 text-xl font-bold">Invitation prepared</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">The new member now appears in Team with an Invited status and their initial assignment context.</p><button type="button" onClick={resetAndClose} className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">Return to Team</button></div> : status === 'error' ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger"><X className="size-7" /></span><h3 className="mt-5 text-xl font-bold">Invitation could not be prepared</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Review the member information and try again. No changes were made.</p><button type="button" onClick={() => setStatus('form')} className="mt-6 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">Try again</button></div> : <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><div className="flex-1 overflow-y-auto p-6"><div className="grid gap-5 sm:grid-cols-2"><Field name="firstName" label="First Name" required /><Field name="lastName" label="Last Name" required /><Field name="email" label="Work Email" type="email" required /><Field name="jobTitle" label="Job Title" required /><Field name="department" label="Department" options={['Delivery', 'Operations', 'Commercial', 'Finance', 'Executive']} /><Field name="team" label="Team" options={['Business Solutions', 'Platform Engineering', 'Integration Services', 'Quality Assurance', 'Client Operations']} /><Field name="role" label="Role" options={['Delivery Manager', 'Project Manager', 'Business Analyst', 'Product Owner', 'Solution Architect', 'Technical Lead', 'Test Lead', 'Change Lead', 'Executive Sponsor']} /><Field name="manager" label="Manager" options={['Neo Morake', 'Amara Dlamini', 'Lethabo Nkosi', 'Zanele Khumalo']} /><Field name="accessRole" label="Access Role" options={['Member', 'Admin', 'Owner']} /><Field name="project" label="Initial Project Assignment" options={['No initial assignment', 'Claims Automation', 'Client Onboarding', 'Policy Modernisation', 'Document Hub']} /></div>{error ? <p role="alert" className="mt-5 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}<div className="mt-6 rounded-xl border border-info/20 bg-info-soft/40 p-4"><p className="text-sm font-semibold">Invitation-only access</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The member will appear with an Invited status until they accept access to the workspace.</p></div></div><footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={resetAndClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={status === 'loading'} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{status === 'loading' ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}{status === 'loading' ? 'Sending invite…' : 'Send Invite'}</button></footer></form>}
  </aside></div>
}

function Field({ name, label, type = 'text', required, options }: { name: string; label: string; type?: string; required?: boolean; options?: string[] }) {
  const classes = 'mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10'
  return <label className="text-sm font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}{options ? <select name={name} className={classes}>{options.map((option) => <option key={option} value={option === 'No initial assignment' ? '' : option}>{option}</option>)}</select> : <input name={name} type={type} required={required} className={classes} />}</label>
}

export function MemberActionDialog({ member, action, onClose, onComplete }: { member: TeamMember | null; action: MemberAction; onClose: () => void; onComplete: (message: string) => void }) {
  if (!member || !action) return null
  const copy: Record<Exclude<MemberAction, null>, { title: string; description: string }> = {
    assignments: { title: 'Project Assignments', description: 'Review current delivery commitments and allocation.' },
    capacity: { title: 'Capacity Detail', description: 'Review allocated and available delivery capacity.' },
    'change-team': { title: 'Change Team', description: 'Move this member to another delivery team.' },
    'change-role': { title: 'Change Role', description: 'Update the member’s delivery role.' },
    'assign-project': { title: 'Assign Project', description: 'Create a new project assignment and allocation.' },
    availability: { title: 'Update Availability', description: 'Record lightweight delivery availability context.' },
  }
  const content = copy[action]
  const informational = action === 'assignments' || action === 'capacity'
  return <div className="fixed inset-0 z-[85]" onMouseDown={onClose}><div className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="member-action-title" onMouseDown={(event) => event.stopPropagation()} className="absolute top-0 right-0 flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"><header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold tracking-wide text-brand uppercase">{member.name}</p><h2 id="member-action-title" className="mt-1 text-xl font-bold">{content.title}</h2><p className="mt-1 text-sm text-muted-foreground">{content.description}</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></header><div className="flex-1 overflow-y-auto p-6">{informational ? <><div className="grid gap-3 sm:grid-cols-2"><Info label="Current projects" value={String(member.projects)} /><Info label="Allocated capacity" value={`${member.capacity}%`} /><Info label="Available capacity" value={`${Math.max(0, 100 - member.capacity)}%`} /><Info label="Availability" value={member.availability} /></div><div className="mt-5 divide-y divide-border rounded-xl border border-border">{(member.projectNames.length ? member.projectNames : ['No active assignments']).map((project, index) => <div key={project} className="flex items-center justify-between p-4"><div><p className="text-sm font-semibold">{project}</p><p className="mt-1 text-xs text-muted-foreground">{member.role} · {index ? '30%' : `${Math.min(member.capacity, 60)}%`} allocation</p></div><button type="button" className="text-xs font-semibold text-brand">View project</button></div>)}</div></> : <div className="space-y-5">{action === 'change-team' ? <Select label="Team" values={['Business Solutions', 'Platform Engineering', 'Integration Services', 'Quality Assurance', 'Client Operations']} current={member.team} /> : null}{action === 'change-role' ? <Select label="Delivery Role" values={['Delivery Manager', 'Project Manager', 'Business Analyst', 'Product Owner', 'Solution Architect', 'Technical Lead', 'Test Lead', 'Change Lead', 'Executive Sponsor']} current={member.role} /> : null}{action === 'assign-project' ? <><Select label="Project" values={['Claims Automation', 'Client Onboarding', 'Policy Modernisation', 'Vendor Integration', 'Document Hub']} /><label className="block text-sm font-medium">Allocation %<input type="number" min="0" max="150" defaultValue="25" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Start Date<input type="date" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label><label className="text-sm font-medium">End Date<input type="date" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3" /></label></div></> : null}{action === 'availability' ? <><Select label="Availability" values={['Available', 'Partial', 'Busy', 'Unavailable']} current={member.availability} /><label className="block text-sm font-medium">Reason<select className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3"><option>Fully allocated</option><option>Temporary unavailability</option><option>Planned time away</option><option>Project commitment</option></select></label></> : null}<label className="block text-sm font-medium">Notes<textarea rows={4} className="mt-1.5 w-full rounded-lg border border-border bg-background p-3" /></label></div>}</div><footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Close</button>{!informational ? <button type="button" onClick={() => onComplete(`${content.title} completed for ${member.name}.`)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Save changes</button> : null}</footer></aside></div>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div> }
function Select({ label, values, current }: { label: string; values: string[]; current?: string }) { return <label className="block text-sm font-medium">{label}<select defaultValue={current} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3">{values.map((value) => <option key={value}>{value}</option>)}</select></label> }
