import 'server-only'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { LOGGED_ACTIVITY_KINDS } from '../vocabulary'
import type { Contact, FollowUp, ParentKind, RecordWorkspace, TimelinePage } from '../types'

export const TIMELINE_PAGE_SIZE = 20

type Cursor = { at: string; id: string }

async function authorNames(): Promise<Map<string, string>> {
  const members = await listOrganizationMembers()
  return new Map(members.map((member) => [member.userId, member.displayName]))
}

/** One page of a record's timeline, newest first. Asks for one extra row to know whether there is more. */
export async function fetchTimeline(db: any, kind: ParentKind, id: string, cursor?: Cursor): Promise<TimelinePage> {
  const { data, error } = await db.rpc('record_timeline', {
    p_kind: kind,
    p_id: id,
    p_limit: TIMELINE_PAGE_SIZE + 1,
    p_before: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
  })
  if (error) throw error
  const rows: any[] = data ?? []
  const names = await authorNames()
  const logged = new Set<string>(LOGGED_ACTIVITY_KINDS)
  return {
    hasMore: rows.length > TIMELINE_PAGE_SIZE,
    entries: rows.slice(0, TIMELINE_PAGE_SIZE).map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      body: row.body,
      occurredAt: row.occurred_at,
      details: row.details ?? {},
      createdBy: row.created_by,
      author: row.created_by ? names.get(row.created_by) ?? null : null,
      system: !logged.has(row.kind),
    })),
  }
}

const TASK_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id' } as const

export async function getRecordWorkspace(kind: ParentKind, id: string): Promise<RecordWorkspace> {
  const { organization, user, role } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const orgId = organization.id

  let contactParent: RecordWorkspace['contactParent'] = null
  let contactsNote: string | null = null
  let conversion: RecordWorkspace['conversion'] = null
  const record: RecordWorkspace['record'] = { archived: false, status: null, stage: null, lostReason: null }

  if (kind === 'client') {
    contactParent = { kind: 'client', id }
  } else if (kind === 'lead') {
    const { data, error } = await db
      .from('leads')
      .select('status, archived_at, converted_at, converted_client_id, converted_opportunity_id')
      .eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    record.archived = Boolean(data?.archived_at)
    record.status = data?.status ?? null
    if (data?.converted_at) {
      conversion = { convertedAt: data.converted_at, clientId: data.converted_client_id, opportunityId: data.converted_opportunity_id }
      contactParent = data.converted_client_id ? { kind: 'client', id: data.converted_client_id } : null
      contactsNote = 'This lead has been converted, so its contacts are now on the client.'
    } else {
      contactParent = { kind: 'lead', id }
    }
  } else if (kind === 'opportunity') {
    const { data, error } = await db
      .from('sales_opportunities')
      .select('client_id, lead_id, stage, lost_reason, archived_at')
      .eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    record.archived = Boolean(data?.archived_at)
    record.stage = data?.stage ?? null
    record.lostReason = data?.lost_reason ?? null
    if (data?.client_id) {
      contactParent = { kind: 'client', id: data.client_id }
      contactsNote = "Showing the client's contacts."
    } else if (data?.lead_id) {
      contactParent = { kind: 'lead', id: data.lead_id }
      contactsNote = "Showing the lead's contacts."
    }
  }

  const teamMembers = await loadTeamMembers(db, orgId)
  const [contacts, timeline, followUps, ownProfiles] = await Promise.all([
    contactParent ? loadContacts(db, orgId, contactParent) : Promise.resolve([] as Contact[]),
    fetchTimeline(db, kind, id),
    kind === 'quote' ? Promise.resolve([] as FollowUp[]) : loadFollowUps(db, orgId, kind, id, teamMembers),
    db.from('team_members').select('id').eq('organization_id', orgId).eq('user_id', user.id).is('archived_at', null),
  ])
  if (ownProfiles.error) throw ownProfiles.error

  return {
    kind,
    id,
    currentUserId: user.id,
    canModerate: role === 'owner' || role === 'admin',
    contactParent,
    contactsNote,
    contacts,
    timeline,
    followUps,
    teamMembers,
    defaultAssigneeId: (ownProfiles.data ?? [])[0]?.id ?? null,
    conversion,
    record,
  }
}

async function loadContacts(db: any, orgId: string, parent: { kind: 'client' | 'lead'; id: string }): Promise<Contact[]> {
  const { data, error } = await db
    .from('contacts')
    .select('id, full_name, email, phone, job_title, notes, is_primary')
    .eq('organization_id', orgId)
    .eq(parent.kind === 'client' ? 'client_id' : 'lead_id', parent.id)
    .is('archived_at', null)
    .order('is_primary', { ascending: false })
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id, fullName: row.full_name, email: row.email, phone: row.phone,
    jobTitle: row.job_title, notes: row.notes, isPrimary: row.is_primary,
  }))
}

async function loadTeamMembers(db: any, orgId: string) {
  const { data, error } = await db
    .from('team_members')
    .select('id, full_name')
    .eq('organization_id', orgId)
    .eq('status', 'Active')
    .is('archived_at', null)
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((row: any) => ({ id: row.id, name: row.full_name }))
}

async function loadFollowUps(
  db: any,
  orgId: string,
  kind: 'lead' | 'client' | 'opportunity',
  id: string,
  members: Array<{ id: string; name: string }>,
): Promise<FollowUp[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, status, priority, due_at, assignee_id')
    .eq('organization_id', orgId)
    .eq(TASK_COLUMN[kind], id)
    .is('archived_at', null)
    .neq('status', 'Cancelled')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  const names = new Map<string, string>(members.map((member) => [member.id, member.name]))
  return (data ?? []).map((row: any) => ({
    id: row.id, title: row.title, status: row.status, priority: row.priority, dueAt: row.due_at,
    assignee: row.assignee_id ? names.get(row.assignee_id) ?? null : null,
    done: row.status === 'Complete',
  }))
}
