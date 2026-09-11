'use client'

import { KeyRound, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'

import {
  deleteAutomationRuleAction,
  deleteIntegrationAction,
  enqueueAutomationRuleAction,
  rotateIntegrationSecretAction,
  saveAutomationRuleAction,
  saveIntegrationAction,
  setAutomationStatusAction,
  setIntegrationStatusAction,
} from '../actions'
import type { AutomationRule, IntegrationConnection } from '../types'

const inputClass = 'mt-1.5 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand'
const providers = ['Webhook', 'Microsoft 365', 'Google Workspace', 'Supabase', 'Accounting', 'Payments', 'Email', 'Calendar', 'Cloud Storage']

export function IntegrationForm({ connection }: { connection?: IntegrationConnection | null }) {
  const [state, action, pending] = useActionState(saveIntegrationAction.bind(null, connection?.id), undefined)
  return <form action={action} className="border border-border bg-card">
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <Field name="name" label="Connection name" required defaultValue={connection?.name} placeholder="Finance webhook" />
      <label className="text-sm font-medium">Provider<span className="text-destructive"> *</span><select name="provider" required defaultValue={connection?.provider ?? 'Webhook'} className={inputClass}>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></label>
      <Field name="eventKey" label="Inbound event key" required defaultValue={connection?.eventKey} placeholder="finance.invoice_paid" help="Stable key used by external event senders and automation triggers." />
      <div className="border border-border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">Secrets are generated separately and displayed once. UNISON stores only the verification hash and a masked hint.</div>
    </div>
    {state?.error ? <p role="alert" className="mx-6 mb-4 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{state.error}</p> : null}
    <footer className="flex justify-end gap-2 border-t border-border p-5"><Link href={connection ? `/settings/integrations/${connection.id}` : '/settings/integrations'} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save integration'}</button></footer>
  </form>
}

export function IntegrationControls({ connection }: { connection: IntegrationConnection }) {
  const next = connection.status === 'connected' ? 'disabled' : 'connected'
  return <div className="flex flex-wrap gap-2">
    <form action={setIntegrationStatusAction}><input type="hidden" name="id" value={connection.id} /><input type="hidden" name="status" value={next} /><button type="submit" className="border border-border px-4 py-2 text-sm font-semibold">{next === 'connected' ? 'Enable connection' : 'Disable connection'}</button></form>
    <Link href={`/settings/integrations/${connection.id}/edit`} className="border border-border px-4 py-2 text-sm font-semibold">Edit details</Link>
    <ConfirmDeleteForm action={deleteIntegrationAction} id={connection.id} label="Delete integration" />
  </div>
}

export function IntegrationSecretControl({ connectionId, secretHint }: { connectionId: string; secretHint: string | null }) {
  const [state, action, pending] = useActionState(rotateIntegrationSecretAction.bind(null, connectionId), undefined)
  return <section className="border border-border bg-card p-5">
    <div className="flex items-start gap-3"><KeyRound className="mt-0.5 size-5 text-brand" /><div className="min-w-0 flex-1"><h2 className="unison-section-title text-sm">Inbound secret</h2><p className="mt-2 text-sm text-muted-foreground">Current hint: {secretHint ?? 'No secret generated'}</p></div></div>
    {state?.secret ? <div role="status" className="mt-4 border border-warning/30 bg-warning-soft/35 p-4"><p className="text-xs font-semibold text-warning">Copy this secret now. It will not be shown again.</p><code className="mt-2 block break-all text-sm text-foreground">{state.secret}</code></div> : null}
    {state?.error ? <p role="alert" className="mt-4 text-sm text-destructive">{state.error}</p> : null}
    <form action={action} className="mt-4"><button type="submit" disabled={pending} className="inline-flex items-center gap-2 bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{pending ? 'Rotating…' : secretHint ? 'Rotate secret' : 'Generate secret'}</button></form>
  </section>
}

export function AutomationRuleForm({ rule, integrations }: { rule?: AutomationRule | null; integrations: IntegrationConnection[] }) {
  const [state, action, pending] = useActionState(saveAutomationRuleAction.bind(null, rule?.id), undefined)
  const actionConfig = rule?.actionConfig ?? {}
  const eventKey = typeof rule?.triggerConfig.event_key === 'string' ? rule.triggerConfig.event_key : ''
  return <form action={action} className="border border-border bg-card">
    <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
      <Field name="name" label="Automation name" required defaultValue={rule?.name} placeholder="Notify finance when an invoice is paid" />
      <label className="text-sm font-medium">Status<select name="status" defaultValue={rule?.status ?? 'draft'} className={inputClass}>{['draft', 'active', 'paused'].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
      <label className="text-sm font-medium">Trigger<select name="triggerType" defaultValue={rule?.triggerType ?? 'manual'} className={inputClass}>{[['manual','Manual'],['schedule','Schedule'],['integration_event','Integration event']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium">Integration<select name="integrationConnectionId" defaultValue={rule?.integrationConnectionId ?? ''} className={inputClass}><option value="">No integration</option>{integrations.map((connection) => <option key={connection.id} value={connection.id}>{connection.name} · {connection.provider}</option>)}</select></label>
      <Field name="eventKey" label="Integration event key" defaultValue={eventKey} placeholder="finance.invoice_paid" help="Optional event-key filter for integration triggers." />
      <Field name="intervalMinutes" label="Schedule interval (minutes)" type="number" min="5" max="525600" defaultValue={String(rule?.schedule?.intervalMinutes ?? 60)} help="Used only when the trigger is Schedule." />
      <Field name="timezone" label="Schedule timezone" required defaultValue={rule?.schedule?.timezone ?? 'Africa/Johannesburg'} />
      <div />
      <TextArea name="description" label="Description" defaultValue={rule?.description} />
      <div className="md:col-span-2 border-t border-border pt-5"><h2 className="unison-section-title text-sm">Notification action</h2><p className="mt-1 text-xs text-muted-foreground">Each successful run creates a persistent in-product notification.</p></div>
      <Field name="notificationTitle" label="Notification title" required defaultValue={stringValue(actionConfig.title)} placeholder="Invoice paid" />
      <label className="text-sm font-medium">Category<select name="notificationCategory" defaultValue={stringValue(actionConfig.category) || 'System'} className={inputClass}>{['System', 'Delivery', 'Operations', 'Commercial', 'Finance', 'Support', 'Documents', 'Import'].map((category) => <option key={category}>{category}</option>)}</select></label>
      <TextArea name="notificationBody" label="Notification message" defaultValue={stringValue(actionConfig.body)} />
    </div>
    {state?.error ? <p role="alert" className="mx-6 mb-4 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{state.error}</p> : null}
    <footer className="flex justify-end gap-2 border-t border-border p-5"><Link href={rule ? `/settings/automations/${rule.id}` : '/settings/automations'} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save automation'}</button></footer>
  </form>
}

export function AutomationControls({ rule }: { rule: AutomationRule }) {
  const next = rule.status === 'active' ? 'paused' : 'active'
  return <div className="flex flex-wrap gap-2">
    <form action={enqueueAutomationRuleAction}><input type="hidden" name="id" value={rule.id} /><button type="submit" className="inline-flex items-center gap-2 bg-brand px-4 py-2 text-sm font-semibold text-white"><Play className="size-4" />Run now</button></form>
    <form action={setAutomationStatusAction}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="status" value={next} /><button type="submit" className="border border-border px-4 py-2 text-sm font-semibold">{next === 'active' ? 'Activate' : 'Pause'}</button></form>
    <Link href={`/settings/automations/${rule.id}/edit`} className="border border-border px-4 py-2 text-sm font-semibold">Edit rule</Link>
    <ConfirmDeleteForm action={deleteAutomationRuleAction} id={rule.id} label="Delete automation" />
  </div>
}

function ConfirmDeleteForm({ action, id, label }: { action: (formData: FormData) => void | Promise<void>; id: string; label: string }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`${label}? This cannot be undone.`)) event.preventDefault() }}><input type="hidden" name="id" value={id} /><button type="submit" className="inline-flex items-center gap-2 border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive"><Trash2 className="size-4" />{label}</button></form>
}

function Field({ name, label, defaultValue, required, placeholder, help, type = 'text', min, max }: { name: string; label: string; defaultValue?: string | null; required?: boolean; placeholder?: string; help?: string; type?: string; min?: string; max?: string }) {
  return <label className="text-sm font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}<input name={name} type={type} min={min} max={max} required={required} defaultValue={defaultValue ?? ''} placeholder={placeholder} className={inputClass} />{help ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span> : null}</label>
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string | null }) {
  return <label className="text-sm font-medium md:col-span-2">{label}<textarea name={name} rows={4} defaultValue={defaultValue ?? ''} className={`${inputClass} py-3`} /></label>
}

function stringValue(value: unknown) { return typeof value === 'string' ? value : '' }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
