'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { saveKnowledgeArticleAction, saveSubscriptionAction, saveSupportCaseAction, saveTenantConfigurationAction } from '../actions'
import type { KnowledgeArticle, PlatformOrganization, PlatformSubscription, SupportCase, SupportTicketOption, TenantConfiguration } from '../types'

const input = 'mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand'

export function TenantConfigurationForm({ organization, configuration }: { organization: PlatformOrganization; configuration: TenantConfiguration | null }) {
  const [state, action, pending] = useActionState(saveTenantConfigurationAction, undefined)
  return <form action={action} className="border border-border bg-card">
    <input type="hidden" name="organizationId" value={organization.id} />
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <Select name="operatingModel" label="Operating model" value={configuration?.operating_model ?? 'hybrid'} options={['centralized', 'federated', 'hybrid']} />
      <Field name="defaultCurrency" label="Default currency" required value={configuration?.default_currency ?? 'ZAR'} maxLength={3} />
      <Field name="timezone" label="Timezone" required value={configuration?.timezone ?? 'Africa/Johannesburg'} />
      <Field name="dataRegion" label="Data region" required value={configuration?.data_region ?? 'South Africa'} />
      <Field name="retentionDays" label="Data retention (days)" type="number" min={30} max={3650} required value={String(configuration?.retention_days ?? 2555)} />
      <Field name="approvalEscalationHours" label="Approval escalation (hours)" type="number" min={1} max={720} required value={String(configuration?.approval_escalation_hours ?? 48)} />
      <Select name="projectVisibility" label="Project visibility" value={configuration?.project_visibility ?? 'organization'} options={['organization', 'restricted']} />
      <label className="flex items-center gap-3 self-end border border-border px-4 py-3 text-sm font-medium"><input name="evidenceRequired" type="checkbox" defaultChecked={configuration?.evidence_required ?? true} />Require governance evidence at approval gates</label>
      <TextArea name="strategicObjectives" label="Strategic objectives" description="One objective per line." value={(configuration?.strategic_objectives ?? []).join('\n')} />
    </div>
    <FormFooter back="/internal/tenants" pending={pending} label="Save configuration" error={state?.error} />
  </form>
}

export function SubscriptionForm({ organizations, subscription }: { organizations: PlatformOrganization[]; subscription?: PlatformSubscription | null }) {
  const bound = saveSubscriptionAction.bind(null, subscription?.id)
  const [state, action, pending] = useActionState(bound, undefined)
  return <form action={action} className="border border-border bg-card">
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <label className="text-sm font-medium">Organization<select name="organizationId" required defaultValue={subscription?.organization_id ?? ''} disabled={Boolean(subscription)} className={input}><option value="">Select organization…</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{subscription ? <input type="hidden" name="organizationId" value={subscription.organization_id} /> : null}</label>
      <Select name="planKey" label="Plan" value={subscription?.plan_key ?? 'strategic-enterprise'} options={['core', 'framework', 'enterprise', 'strategic-enterprise']} />
      <Select name="status" label="Status" value={subscription?.status ?? 'draft'} options={['draft', 'pending', 'active', 'paused', 'cancelled', 'expired']} />
      <Select name="billingCycle" label="Billing cycle" value={subscription?.billing_cycle ?? 'annual'} options={['monthly', 'annual', 'custom']} />
      <Field name="seatLimit" label="Seat limit" type="number" min={1} max={100000} required value={String(subscription?.seat_limit ?? 25)} />
      <Field name="amount" label="Subscription amount" type="number" min={0} step="0.01" required value={String(subscription?.amount ?? 0)} />
      <Field name="currency" label="Currency" required maxLength={3} value={subscription?.currency ?? 'ZAR'} />
      <Field name="billingEmail" label="Billing email" type="email" value={subscription?.billing_email ?? ''} />
      <Field name="startsOn" label="Starts on" type="date" required value={subscription?.starts_on ?? new Date().toISOString().slice(0, 10)} />
      <Field name="renewsOn" label="Renews on" type="date" value={subscription?.renews_on ?? ''} />
      <TextArea name="notes" label="Commercial notes" value={subscription?.notes ?? ''} />
    </div>
    <FormFooter back="/internal/subscriptions" pending={pending} label="Save subscription" error={state?.error} />
  </form>
}

export function SupportCaseForm({ organizations, supportCase, linkedTicket }: { organizations: PlatformOrganization[]; supportCase?: SupportCase | null; linkedTicket?: SupportTicketOption | null }) {
  const bound = saveSupportCaseAction.bind(null, supportCase?.id)
  const [state, action, pending] = useActionState(bound, undefined)
  return <form action={action} className="border border-border bg-card">
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <input type="hidden" name="supportTicketId" value={supportCase?.support_ticket_id ?? linkedTicket?.id ?? ''} />
      <label className="text-sm font-medium">Organization<select name="organizationId" required defaultValue={supportCase?.organization_id ?? linkedTicket?.organization_id ?? ''} disabled={Boolean(supportCase || linkedTicket)} className={input}><option value="">Select organization…</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{supportCase || linkedTicket ? <input type="hidden" name="organizationId" value={supportCase?.organization_id ?? linkedTicket?.organization_id} /> : null}</label>
      <Field name="subject" label="Subject" required value={supportCase?.subject ?? linkedTicket?.subject ?? ''} />
      <Select name="category" label="Category" value={supportCase?.category ?? linkedTicket?.category ?? 'General'} options={['General', 'Access', 'Data', 'Delivery', 'Billing', 'Technical']} />
      <Select name="priority" label="Priority" value={supportCase?.priority ?? linkedTicket?.priority ?? 'Medium'} options={['Low', 'Medium', 'High', 'Critical']} />
      <Select name="status" label="Status" value={supportCase?.status ?? 'Open'} options={['Open', 'Investigating', 'Waiting on Customer', 'Resolved', 'Closed']} />
      <Field name="assigneeName" label="Internal assignee" value={supportCase?.assignee_name ?? ''} />
      <Field name="slaDueAt" label="SLA due" type="datetime-local" value={supportCase?.sla_due_at?.slice(0, 16) ?? ''} />
      <TextArea name="internalNotes" label="Internal notes" description="Visible only to HIMARK platform administrators." value={supportCase?.internal_notes ?? ''} />
      <TextArea name="resolution" label="Resolution" value={supportCase?.resolution ?? ''} />
    </div>
    <FormFooter back="/internal/support" pending={pending} label="Save support case" error={state?.error} />
  </form>
}

export function KnowledgeArticleForm({ scope, article }: { scope: 'internal' | 'tenant'; article?: KnowledgeArticle | null }) {
  const bound = saveKnowledgeArticleAction.bind(null, scope, article?.id)
  const [state, action, pending] = useActionState(bound, undefined)
  const base = scope === 'internal' ? '/internal/knowledge' : '/knowledge'
  return <form action={action} className="border border-border bg-card">
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <Field name="title" label="Article title" required value={article?.title ?? ''} />
      <Select name="category" label="Category" value={article?.category ?? 'Guide'} options={['Guide', 'Policy', 'Procedure', 'FAQ', 'Release Note', 'Troubleshooting']} />
      {scope === 'tenant' ? <input type="hidden" name="visibility" value="organization" /> : <input type="hidden" name="visibility" value="internal" />}
      <Select name="status" label="Publication status" value={article?.status ?? 'draft'} options={['draft', 'published', 'archived']} />
      <Field name="tags" label="Tags" value={(article?.tags ?? []).join(', ')} />
      <TextArea name="summary" label="Summary" value={article?.summary ?? ''} />
      <TextArea name="content" label="Article content" required rows={14} value={article?.content ?? ''} />
    </div>
    <FormFooter back={article ? `${base}/${article.id}` : base} pending={pending} label={article ? 'Save new version' : 'Create article'} error={state?.error} />
  </form>
}

function FormFooter({ back, pending, label, error }: { back: string; pending: boolean; label: string; error?: string }) {
  return <><div aria-live="polite" className="px-6">{error ? <p role="alert" className="border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}</div><footer className="mt-5 flex justify-end gap-2 border-t border-border p-5"><Link href={back} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : label}</button></footer></>
}

function Field({ name, label, value, type = 'text', required, min, max, step, maxLength }: { name: string; label: string; value?: string; type?: string; required?: boolean; min?: number; max?: number; step?: string; maxLength?: number }) {
  return <label className="text-sm font-medium">{label}<input name={name} type={type} required={required} min={min} max={max} step={step} maxLength={maxLength} defaultValue={value ?? ''} className={input} /></label>
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return <label className="text-sm font-medium">{label}<select name={name} defaultValue={value} className={input}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function TextArea({ name, label, value, description, rows = 5, required }: { name: string; label: string; value?: string; description?: string; rows?: number; required?: boolean }) {
  return <label className="text-sm font-medium md:col-span-2">{label}{description ? <span className="ml-2 text-xs font-normal text-muted-foreground">{description}</span> : null}<textarea name={name} rows={rows} required={required} defaultValue={value ?? ''} className={`${input} h-auto py-3`} /></label>
}
