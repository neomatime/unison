import 'server-only'

import { resolveDisplayName } from '@/lib/auth/display-name'
import { buildDocumentView } from '../document-view'
import { defaultEmailMessage, defaultEmailSubject, isValidEmailAddress } from '../email'
import type { DocumentBundle } from './get-document'
import { documentContext } from '../server-context'
import type { DocumentKind } from '../vocabulary'

/** What the email form starts with: the client's billing address (else the primary contact's), a subject and a short message. */
export async function getEmailDefaults(kind: DocumentKind, bundle: DocumentBundle): Promise<{ to: string; subject: string; body: string }> {
  const { organization, user, db } = await documentContext()
  const view = buildDocumentView({ kind, ...bundle })

  let to = ''
  const billing = String(bundle.client?.billing_email ?? '').trim()
  if (isValidEmailAddress(billing)) {
    to = billing
  } else if (bundle.record.client_id) {
    const primary = await db
      .from('contacts')
      .select('email')
      .eq('client_id', bundle.record.client_id)
      .eq('organization_id', organization.id)
      .eq('is_primary', true)
      .is('archived_at', null)
      .maybeSingle()
    if (primary.error) throw primary.error
    const contact = String(primary.data?.email ?? '').trim()
    if (isValidEmailAddress(contact)) to = contact
  }
  return { to, subject: defaultEmailSubject(view), body: defaultEmailMessage(view, resolveDisplayName(user)) }
}
