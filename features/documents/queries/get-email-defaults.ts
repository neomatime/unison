import 'server-only'

import { resolveDisplayName } from '@/lib/auth/display-name'
import { EMAIL_DEFAULT_NOTE } from '../../quote-portal/copy'
import { buildDocumentView } from '../document-view'
import { defaultEmailMessage, defaultEmailSubject, isValidEmailAddress } from '../email'
import type { DocumentBundle } from './get-document'
import { documentContext } from '../server-context'
import type { DocumentKind } from '../vocabulary'

/**
 * What the email form starts with: the client's billing address (else the primary contact's), a subject and a short
 * message. `portal` is true when the email action will send the branded email with a secure link (Ruling 2: a Sent
 * quote of an organisation that has switched the portal on); the message is then the personal note inside that
 * template, which adds the greeting and signature itself, so it starts as the default note alone.
 */
export async function getEmailDefaults(kind: DocumentKind, bundle: DocumentBundle): Promise<{ to: string; subject: string; body: string; portal: boolean }> {
  const { organization, user, db } = await documentContext()
  const view = buildDocumentView({ kind, ...bundle })
  const portal = kind === 'quote' && bundle.record.status === 'Sent' && bundle.settings?.quote_portal_enabled === true

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
  return { to, subject: defaultEmailSubject(view), body: portal ? EMAIL_DEFAULT_NOTE : defaultEmailMessage(view, resolveDisplayName(user)), portal }
}
