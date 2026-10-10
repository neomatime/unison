'use client'

import { useActionState, useEffect, useState } from 'react'

import { addContactAction, archiveContactAction, makePrimaryContactAction, updateContactAction } from '../actions/contacts'
import type { Contact } from '../types'
import { ActionButton } from './action-button'
import { area, Feedback, input } from './form-parts'
import { WorkspaceSection } from './workspace-section'

type Parent = { kind: 'client' | 'lead'; id: string }

export function ContactsSection({ parent, contacts, note }: { parent: Parent | null; contacts: Contact[]; note: string | null }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <WorkspaceSection title="Contacts" description="The people at this account.">
      {note ? <p className="border-b border-border px-5 py-3 text-xs text-[var(--briefing-muted)]">{note}</p> : null}
      {contacts.length ? (
        <ul className="divide-y divide-border">
          {contacts.map((contact) =>
            editingId === contact.id ? (
              <li key={contact.id}><EditContactForm contact={contact} onDone={() => setEditingId(null)} /></li>
            ) : (
              <li key={contact.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {contact.fullName}
                    {contact.isPrimary ? <span className="ml-2 bg-[var(--brand-soft)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand">Primary</span> : null}
                  </p>
                  <p className="text-xs text-[var(--briefing-muted)]">
                    {[contact.jobTitle, contact.email, contact.phone].filter(Boolean).join(' · ') || 'No details recorded'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingId(contact.id)} aria-label={`Edit ${contact.fullName}`} className="border border-border px-3 py-1.5 text-xs font-semibold">Edit</button>
                  {!contact.isPrimary ? <ActionButton action={makePrimaryContactAction.bind(null, contact.id)} label="Make primary" ariaLabel={`Make primary: ${contact.fullName}`} /> : null}
                  <ActionButton action={archiveContactAction.bind(null, contact.id)} label="Remove" ariaLabel={`Remove ${contact.fullName}`} tone="danger" confirmText={`Remove ${contact.fullName} from this account's contacts?`} />
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No contacts yet.</p>
      )}
      {parent ? <AddContactForm parent={parent} /> : <p className="border-t border-border px-5 py-4 text-xs text-[var(--briefing-muted)]">Link this record to a client or a lead to add contacts.</p>}
    </WorkspaceSection>
  )
}

function ContactFields({ contact }: { contact?: Contact }) {
  return (
    <>
      <input name="fullName" required aria-label="Full name" placeholder="Full name" defaultValue={contact?.fullName ?? ''} className={input} />
      <input name="jobTitle" aria-label="Job title" placeholder="Job title" defaultValue={contact?.jobTitle ?? ''} className={input} />
      <input name="email" type="email" aria-label="Email" placeholder="Email" defaultValue={contact?.email ?? ''} className={input} />
      <input name="phone" type="tel" aria-label="Phone" placeholder="Phone" defaultValue={contact?.phone ?? ''} className={input} />
      <textarea name="notes" aria-label="Notes" placeholder="Notes" defaultValue={contact?.notes ?? ''} className={`${area} md:col-span-2`} />
    </>
  )
}

function AddContactForm({ parent }: { parent: Parent }) {
  const [state, action, pending] = useActionState(addContactAction.bind(null, parent.kind, parent.id), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-2">
      <ContactFields />
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="isPrimary" /> Make this the primary contact
      </label>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Add contact</button>
      </div>
    </form>
  )
}

function EditContactForm({ contact, onDone }: { contact: Contact; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateContactAction.bind(null, contact.id), undefined)
  // React resets an action-bound form's uncontrolled fields afterwards, so close on success.
  useEffect(() => {
    if (state?.success) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="grid gap-3 bg-muted/20 p-5 md:grid-cols-2">
      <ContactFields contact={contact} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save changes</button>
        </div>
      </div>
    </form>
  )
}
