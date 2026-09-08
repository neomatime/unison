'use client'

import { ArrowLeft, Check, CheckCircle2, Clock3, Send } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { approvals } from '../data'
import { HealthBadge, SectionCard } from './delivery-primitives'

export function ApprovalForm() {
  const [done, setDone] = useState(false)
  if (done) return <>
    <WorkspaceHeader category="Delivery" parent={{ label: 'Approvals', href: '/delivery/approvals' }} title="Approval request created" />
    <div className="mx-auto max-w-xl border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-bold">Approval request ready</h2><p className="mt-2 text-sm text-muted-foreground">The approver sequence, evidence and due date have been prepared.</p><Link href="/delivery/approvals/uat-signoff" className="mt-6 inline-flex bg-brand px-4 py-2 text-sm font-semibold text-white">Open approval</Link></div>
  </>
  return <>
    <WorkspaceHeader category="Delivery" parent={{ label: 'Approvals', href: '/delivery/approvals' }} title="New Approval" description="Create a controlled decision request with clear evidence and accountability." />
    <form onSubmit={(event) => { event.preventDefault(); setDone(true) }} className="mx-auto max-w-5xl space-y-5">
      <FormSection title="Approval request"><Field label="Title" required /><Field label="Approval Type" options={['Framework Gate', 'Project', 'Requirement', 'Deliverable', 'Vendor', 'Commercial']} /><Field label="Description" textarea className="md:col-span-2" /><Field label="Related Record" /><Field label="Priority" options={['Low', 'Medium', 'High', 'Critical']} /></FormSection>
      <FormSection title="Approvers & timing"><Field label="Primary Approver" options={['Neo Morake', 'Zanele Khumalo', 'Amara Dlamini']} /><Field label="Due Date" type="date" /><Field label="Approver Sequence" textarea className="md:col-span-2" /><Field label="Evidence" placeholder="Attach or link controlled evidence" /><Field label="Comments" textarea className="md:col-span-2" /></FormSection>
      <footer className="flex justify-end gap-2 border border-border bg-card p-4"><Link href="/delivery/approvals" className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="button" className="border border-border px-4 py-2 text-sm font-medium">Save Draft</button><button type="submit" className="bg-brand px-4 py-2 text-sm font-semibold text-white">Submit for Approval</button></footer>
    </form>
  </>
}

export function ApprovalDetail({ approvalId }: { approvalId: string }) {
  const approval = approvals.find((item) => item.id === approvalId) ?? approvals[0]
  const [status, setStatus] = useState(String(approval.status))
  const [message, setMessage] = useState('')
  useEffect(() => { setStatus(sessionStorage.getItem(`unison:approval-status:${approvalId}`) ?? String(approval.status)) }, [approval.status, approvalId])
  const decisionHref = (action: string) => `/delivery/approvals/${approvalId}/review?action=${action}`

  return <>
    <WorkspaceHeader category="Delivery" parent={{ label: 'Approvals', href: '/delivery/approvals' }} title={approval.approval} description={`${approval.type} · ${approval.related}`} />
    <div className="-mt-2 mb-5 flex items-center justify-between"><Link href="/delivery/approvals" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Back to Approvals</Link><HealthBadge>{status}</HealthBadge></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <SectionCard title="Approval summary"><div className="grid gap-4 p-5 sm:grid-cols-2">{[['Requested by', approval.requestedBy], ['Current approver', approval.approver], ['Priority', approval.priority], ['Due date', approval.due], ['Related record', approval.related], ['Status', status]].map(([label, value]) => <div key={label}><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div></SectionCard>
        <SectionCard title="Evidence" description="Controlled information supporting the decision."><div className="divide-y divide-border">{['UAT execution report.pdf', 'Requirements traceability.xlsx', 'Business owner sign-off.docx'].map((file) => <button type="button" key={file} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30"><span className="flex size-9 items-center justify-center bg-muted"><Check className="size-4 text-brand" /></span><span className="text-sm font-semibold">{file}</span><span className="ml-auto text-xs text-brand">Preview</span></button>)}</div></SectionCard>
        <SectionCard title="Decision history"><div className="divide-y divide-border">{['Approval requested · Thabo Mokoena', 'Evidence updated · Naledi Maseko', 'Reminder sent · UNISON'].map((item, index) => <div key={item} className="flex items-center gap-3 px-5 py-4"><Clock3 className="size-4 text-muted-foreground" /><span className="text-sm">{item}</span><span className="ml-auto text-xs text-muted-foreground">{index + 1}d ago</span></div>)}</div></SectionCard>
      </div>
      <aside className="space-y-5">
        <SectionCard title="Record decision"><div className="space-y-2 p-5"><Link href={decisionHref('approve')} className="flex w-full items-center justify-center gap-2 bg-success px-4 py-2.5 text-sm font-semibold text-white"><Check className="size-4" />Approve</Link><Link href={decisionHref('changes')} className="flex w-full justify-center border border-warning/30 px-4 py-2.5 text-sm font-semibold text-warning">Request Changes</Link><Link href={decisionHref('reject')} className="flex w-full justify-center border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger">Reject</Link></div></SectionCard>
        <SectionCard title="Manage request"><div className="divide-y divide-border"><Link href={decisionHref('reassign')} className="block px-5 py-3.5 text-sm font-medium hover:bg-muted/30">Reassign</Link><Link href={decisionHref('delegate')} className="block px-5 py-3.5 text-sm font-medium hover:bg-muted/30">Delegate</Link><button type="button" onClick={() => setMessage('A reminder was prepared for the current approver.')} className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-medium hover:bg-muted/30"><Send className="size-4" />Send Reminder</button><Link href={decisionHref('withdraw')} className="block px-5 py-3.5 text-sm font-medium text-destructive hover:bg-muted/30">Withdraw</Link></div></SectionCard>
      </aside>
    </div>
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-50 bg-foreground px-4 py-3 text-sm text-white shadow-xl">{message}</button> : null}
  </>
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border border-border bg-card p-6"><h2 className="mb-5 font-semibold">{title}</h2><div className="grid gap-5 md:grid-cols-2">{children}</div></section> }
function Field({ label, required, type = 'text', options, textarea, className, placeholder }: { label: string; required?: boolean; type?: string; options?: string[]; textarea?: boolean; className?: string; placeholder?: string }) { const name = label.toLowerCase().replaceAll(' ', '-'); const cls = 'mt-1.5 min-h-11 w-full border border-border bg-background px-3 text-sm'; return <label className={className}><span className="text-sm font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span>{textarea ? <textarea name={name} rows={4} required={required} placeholder={placeholder} className={`${cls} py-3`} /> : options ? <select name={name} className={cls}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input name={name} type={type} required={required} placeholder={placeholder} className={cls} />}</label> }
