'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import type { ModuleDefinition } from '../types'

export function ModuleActionPage(props: { module: ModuleDefinition; recordId: string; recordName: string; action: string; subject?: string }) {
  const { module, recordId, recordName, action, subject } = props
  const router = useRouter()
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const returnHref = module.route + '/' + recordId
  const normalized = action.toLowerCase()
  const needsReason = ['disqualify', 'decline', 'lost', 'cancel', 'reject', 'deactivate', 'close'].some((word) => normalized.includes(word))
  const needsSelection = ['assign', 'stage', 'convert'].some((word) => normalized.includes(word))
  const isPeopleRecord = ['contacts', 'team', 'candidates', 'attendees'].some((word) => normalized.includes(word))
  const isWorkRecord = ['tasks', 'subtasks', 'checklist', 'dependencies', 'milestones', 'deliverables'].some((word) => normalized.includes(word))

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    sessionStorage.setItem('unison:record-action:' + module.id + ':' + recordId, action)
    window.setTimeout(() => { setSaving(false); setDone(true) }, 350)
  }

  return <WorkPage category={module.category} title={action} description={'Complete this governed action for ' + recordName + '.'} parent={{ label: recordName, href: returnHref }} guidance={<><p className="font-semibold text-foreground">Record history</p><p className="mt-2">Add enough context for the action to be understood when the activity history is reviewed.</p></>}>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Action prepared</h2><p className="mt-2 text-sm text-muted-foreground">The current UI session now reflects this record action.</p><button type="button" onClick={() => router.push(returnHref)} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to record</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card">
      <header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">{module.singular} action</p><h2 className="mt-2 text-lg font-semibold">{recordName}</h2></header>
      <div className="space-y-5 p-6 lg:p-8">
        {isPeopleRecord ? <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Name<input name="name" required defaultValue={subject ?? ''} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label><label className="block text-sm font-medium">Role<input name="role" required defaultValue={subject ? 'Delivery contributor' : ''} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label></div> : null}
        {isWorkRecord ? <label className="block text-sm font-medium">Title<input name="title" required defaultValue={subject ?? ''} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label> : null}
        {needsSelection ? <label className="block text-sm font-medium">Selection<select name="selection" required className="mt-2 h-11 w-full border border-border bg-background px-3"><option value="">Select an option</option><option>Neo Morake</option><option>Amara Dlamini</option><option>In Review</option><option>Approved</option></select></label> : null}
        <label className="block text-sm font-medium">{needsReason ? 'Reason' : 'Comment'}<textarea name="comment" required={needsReason} rows={5} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.push(returnHref)} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Confirm action'}</button></footer>
    </UnsavedForm>}
  </WorkPage>
}
