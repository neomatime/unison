'use client'

import { LoaderCircle, Send } from 'lucide-react'
import { useActionState } from 'react'

import { createSupportTicketAction } from '@/features/collaboration/actions/create-support-ticket'

export function SupportTicketForm() {
  const [state, action, pending] = useActionState(createSupportTicketAction, undefined)
  return <form action={action} className="border border-border bg-card p-6 lg:p-8">
    <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Subject<span className="text-destructive"> *</span><input name="subject" required minLength={3} maxLength={160} className="mt-2 h-11 w-full border border-border bg-background px-3 text-sm" placeholder="Briefly describe what you need help with" /></label><label className="text-sm font-medium">Category<select name="category" defaultValue="General" className="mt-2 h-11 w-full border border-border bg-background px-3 text-sm">{['General', 'Access', 'Data', 'Delivery', 'Billing', 'Technical'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Priority<select name="priority" defaultValue="Medium" className="mt-2 h-11 w-full border border-border bg-background px-3 text-sm">{['Low', 'Medium', 'High', 'Critical'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium sm:col-span-2">Details<span className="text-destructive"> *</span><textarea name="description" required minLength={10} maxLength={5000} rows={8} className="mt-2 w-full border border-border bg-background p-3 text-sm" placeholder="Include the page, what you expected, what happened, and any error message." /></label></div>
    {state?.error ? <p role="alert" className="mt-5 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{state.error}</p> : null}
    <div className="mt-6 flex justify-end"><button type="submit" disabled={pending} className="inline-flex items-center gap-2 bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{pending ? 'Submitting…' : 'Submit request'}</button></div>
  </form>
}
