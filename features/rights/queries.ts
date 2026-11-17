import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { cleanRestrictions, cleanScopes, type Overrides } from './model'
import type { StoredRights } from './server'

export type AuditEntry = {
  id: string
  at: string
  actor: string
  subject: string
  subjectKey: string
  kind: 'rights.updated' | 'rights.reset' | 'role.changed'
  summary: string
  changes: { label: string; before: string; after: string }[]
}

/** Saved rights by person (the login id for people who have signed in, the email for people who have not), and the latest history. Owner or Admin only (the row rules say so too). */
export async function listRightsData(): Promise<{ rights: Record<string, StoredRights>; audit: AuditEntry[] }> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const [rows, history] = await Promise.all([
    db.from('user_rights').select('user_id, email, overrides, scopes, restrictions').eq('organization_id', organization.id),
    db.from('rights_audit').select('id, created_at, actor_name, subject_user_id, subject_email, subject_name, kind, summary, changes').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(300),
  ])
  const rights: Record<string, StoredRights> = {}
  for (const row of (rows.data ?? []) as any[]) {
    rights[String(row.user_id ?? row.email)] = { overrides: (row.overrides ?? {}) as Overrides, scopes: cleanScopes(row.scopes ?? {}), restrictions: cleanRestrictions(row.restrictions ?? []) }
  }
  const audit: AuditEntry[] = ((history.data ?? []) as any[]).map((row) => ({
    id: String(row.id),
    at: String(row.created_at),
    actor: String(row.actor_name ?? ''),
    subject: String(row.subject_name ?? ''),
    subjectKey: String(row.subject_user_id ?? String(row.subject_email ?? '').toLowerCase()),
    kind: row.kind,
    summary: String(row.summary ?? ''),
    changes: Array.isArray(row.changes) ? row.changes : [],
  }))
  return { rights, audit }
}
