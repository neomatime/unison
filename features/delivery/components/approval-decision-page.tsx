'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import { approvals } from '../data'

export type ApprovalAction = 'approve' | 'changes' | 'reject' | 'reassign' | 'delegate' | 'withdraw'
const copy: Record<ApprovalAction, { title: string; description: string; result: string }> = {
  approve: { title: 'Approve request', description: 'Confirm the evidence and record the governed approval decision.', result: 'Approved' },
  changes: { title: 'Request changes', description: 'Explain what must change before this request can be approved.', result: 'Changes Requested' },
  reject: { title: 'Reject approval', description: 'Record a clear decision reason for the audit history.', result: 'Rejected' },
  reassign: { title: 'Reassign approval', description: 'Transfer accountability for this decision to another approver.', result: 'Pending' },
  delegate: { title: 'Delegate decision', description: 'Assign a delegate while retaining the governed request history.', result: 'Pending' },
  withdraw: { title: 'Withdraw approval', description: 'Remove the request from the active queue with a recorded reason.', result: 'Withdrawn' },
}

export function ApprovalDecisionPage({ approvalId, action }: { approvalId: string; action: ApprovalAction }) {
  const router = useRouter()
  const approval = approvals.find((item) => item.id === approvalId) ?? approvals[0]
  const content = copy[action]
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAssignment = action === 'reassign' || action === 'delegate'
  const needsReason = action !== 'approve' && !isAssignment
  const returnHref = '/delivery/approvals/' + approvalId

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    sessionStorage.setItem('unison:approval-status:' + approvalId, content.result)
    window.setTimeout(() => { setSaving(false); setDone(true) }, 350)
  }

  return <WorkPage category="Delivery" title={content.title} description={content.description} parent={{ label: approval.approval, href: returnHref }} guidance={<><p className="font-semibold text-foreground">Governance record</p><p className="mt-2">The decision, accountable person and supporting context remain part of the approval history.</p></>}>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Action recorded</h2><p className="mt-2 text-sm text-muted-foreground">The approval reflects this decision in the current browser session.</p><button type="button" onClick={() => router.push(returnHref)} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to approval</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card">
      <header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">{approval.type}</p><h2 className="mt-2 text-lg font-semibold">{approval.approval}</h2><p className="mt-1 text-sm text-muted-foreground">{approval.related} · due {approval.due}</p></header>
      <div className="space-y-5 p-6 lg:p-8">
        {isAssignment ? <label className="block text-sm font-medium">New accountable approver<select name="approver" required className="mt-2 h-11 w-full border border-border bg-background px-3"><option>Zanele Khumalo</option><option>Amara Dlamini</option><option>Neo Morake</option></select></label> : null}
        {needsReason ? <label className="block text-sm font-medium">Reason<textarea name="reason" required rows={5} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label> : <label className="block text-sm font-medium">Decision note<textarea name="note" rows={4} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label>}
        {action === 'changes' ? <label className="block text-sm font-medium">Requested updates<textarea name="updates" required rows={4} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.push(returnHref)} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Recording…' : 'Confirm action'}</button></footer>
    </UnsavedForm>}
  </WorkPage>
}
