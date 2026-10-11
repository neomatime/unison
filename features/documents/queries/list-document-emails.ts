import 'server-only'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { documentContext } from '../server-context'
import type { DocumentKind } from '../vocabulary'

export type DocumentEmailRow = { id: string; to: string; subject: string; sentAt: string; sentBy: string }

/** The emails handed to the mail server for one document, newest first (at most 50). */
export async function listDocumentEmails(kind: DocumentKind, id: string): Promise<DocumentEmailRow[]> {
  const { organization, db } = await documentContext()
  const column = kind === 'quote' ? 'quote_id' : 'invoice_id'
  const [rows, members] = await Promise.all([
    db
      .from('document_emails')
      .select('id,to_address,subject,sent_at,sent_by')
      .eq(column, id)
      .eq('organization_id', organization.id)
      .order('sent_at', { ascending: false })
      .limit(50),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error
  const names = new Map<string, string>(members.map((member) => [member.userId, member.displayName]))
  return ((rows.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    to: row.to_address,
    subject: row.subject,
    sentAt: row.sent_at,
    sentBy: (row.sent_by && names.get(row.sent_by)) || 'Former member',
  }))
}
