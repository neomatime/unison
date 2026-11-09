'use client'

import { useActionState } from 'react'

import { SERVICES, type PublicFormConfig } from '../catalog'
import { createFormVersionAction } from '../actions'

export function FormVersionForm({ current, suggestedVersion }: { current: PublicFormConfig; suggestedVersion: string }) {
  const [state, action, pending] = useActionState(createFormVersionAction, undefined)
  return (
    <form action={action} className="border border-border bg-card">
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        <label className="text-sm font-medium">New version<input name="version" required defaultValue={suggestedVersion} className={input} /></label>
        <label className="text-sm font-medium">Privacy notice version<input name="privacyNoticeVersion" required defaultValue={current.privacyNoticeVersion} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Introductory headline<input name="headline" required maxLength={120} defaultValue={current.headline} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Supporting text<textarea name="supportingText" required maxLength={300} rows={3} defaultValue={current.supportingText} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Official Privacy Notice URL<input name="privacyNoticeUrl" required type="url" defaultValue={current.privacyNoticeUrl} className={input} /></label>
      </div>
      <fieldset className="border-t border-border p-6">
        <legend className="px-1 text-sm font-semibold">Published interest options</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => <label key={service.id} className="flex items-start gap-3 border border-border p-4 text-sm"><input className="mt-1 size-4 accent-[var(--brand)]" type="checkbox" name={`service:${service.id}`} defaultChecked={current.enabledServices.includes(service.id)} /><span><span className="font-semibold">{service.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{service.description}</span></span></label>)}
        </div>
      </fieldset>
      {state?.error ? <p role="alert" className="mx-6 mb-5 border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? <p role="status" className="mx-6 mb-5 border border-success/25 bg-success-soft/30 px-4 py-3 text-sm text-success">{state.success}</p> : null}
      <div className="flex items-center justify-between gap-4 border-t border-border p-5"><p className="text-xs leading-5 text-muted-foreground">Publishing creates a new immutable version and retires the current one. Historical answers retain their original meaning.</p><button disabled={pending} className="shrink-0 bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Publishing…' : 'Publish new version'}</button></div>
    </form>
  )
}

const input = 'mt-2 min-h-11 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10'

