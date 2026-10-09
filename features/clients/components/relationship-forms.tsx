'use client'

import { useActionState, useEffect, useRef } from 'react'

import { fieldClasses, FieldLabel } from '@/components/ui/form-fields'
import {
  createClientContactAction,
  createClientFollowUpAction,
  createClientInteractionAction,
  createClientMilestoneAction,
  type RelationshipActionState,
} from '../actions/client-relationships'
import type { ClientContact } from '../queries/get-client-360'

type FormAction = (previous: RelationshipActionState, form: FormData) => Promise<RelationshipActionState>

function RelationshipForm({ action, submitLabel, children }: { action: FormAction; submitLabel: string; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state?.success) formRef.current?.reset() }, [state])
  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
      {children}
      {state?.error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success sm:col-span-2">{state.success}</p> : null}
      <div className="sm:col-span-2"><button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : submitLabel}</button></div>
    </form>
  )
}

function Input({ name, label, type = 'text', required }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block"><FieldLabel label={label} required={required} /><input name={name} type={type} required={required} className={fieldClasses} /></label>
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return <label className="block"><FieldLabel label={label} /><select name={name} className={fieldClasses}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function Textarea({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label className="block sm:col-span-2"><FieldLabel label={label} required={required} /><textarea name={name} rows={3} required={required} className={`${fieldClasses} py-3`} /></label>
}

export function ContactForm({ clientId }: { clientId: string }) {
  return <RelationshipForm action={createClientContactAction.bind(null, clientId)} submitLabel="Add contact">
    <Input name="fullName" label="Full name" required /><Input name="jobTitle" label="Job title" /><Input name="email" label="Email" type="email" /><Input name="phone" label="Phone" type="tel" />
    <Select name="relationshipRole" label="Relationship role" options={['Contact','Primary Contact','Decision Maker','Champion','Technical','Billing']} />
    <Select name="preferredCommunication" label="Preferred communication" options={['','Email','Phone','Meeting','Teams','Other']} />
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isPrimary" /> Set as primary contact</label>
  </RelationshipForm>
}

export function InteractionForm({ clientId, contacts }: { clientId: string; contacts: ClientContact[] }) {
  return <RelationshipForm action={createClientInteractionAction.bind(null, clientId)} submitLabel="Record interaction">
    <Select name="interactionType" label="Interaction type" options={['Phone Call','Meeting','Email','Client Visit','Follow-up','General Note']} /><Input name="occurredAt" label="Date and time" type="datetime-local" required />
    <label className="block"><FieldLabel label="Contact" /><select name="contactId" className={fieldClasses}><option value="">No specific contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}</select></label>
    <Select name="confidentiality" label="Visibility" options={['Internal','Confidential']} /><Textarea name="summary" label="Summary" required /><Input name="nextAction" label="Optional next action" /><Input name="nextActionDueAt" label="Next action due" type="datetime-local" />
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="concernRecorded" /> This interaction records a client concern</label>
  </RelationshipForm>
}

export function MilestoneForm({ clientId }: { clientId: string }) {
  return <RelationshipForm action={createClientMilestoneAction.bind(null, clientId)} submitLabel="Add milestone">
    <Input name="name" label="Milestone name" required /><Select name="milestoneType" label="Milestone type" options={['Important Client Event','Onboarding Anniversary','Partnership Anniversary','Contract Renewal','Relationship Review']} /><Input name="milestoneDate" label="Date" type="date" required /><Input name="notes" label="Notes" />
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="recurringAnnually" /> Repeat annually</label>
  </RelationshipForm>
}

export function FollowUpForm({ clientId }: { clientId: string }) {
  return <RelationshipForm action={createClientFollowUpAction.bind(null, clientId)} submitLabel="Create follow-up">
    <Input name="title" label="Follow-up" required /><Input name="dueAt" label="Due date and time" type="datetime-local" /><Select name="priority" label="Priority" options={['Medium','Low','High','Critical']} /><Textarea name="description" label="Context" />
  </RelationshipForm>
}
