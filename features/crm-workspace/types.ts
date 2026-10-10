// Shapes shared by the queries, the actions and the section components. No directive
// and no imports, so server and client code can all use it.

export type ParentKind = 'lead' | 'client' | 'opportunity' | 'quote'

/** What every action returns to useActionState. */
export type ActionState = { error?: string; success?: string } | undefined

export type Contact = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  notes: string | null
  isPrimary: boolean
}

export type TimelineEntry = {
  id: string
  kind: string
  subject: string
  body: string | null
  occurredAt: string
  details: Record<string, unknown>
  createdBy: string | null
  /** Display name of the author, or null for a system entry or a removed member. */
  author: string | null
  /** True for system entries, which nobody can edit or delete. */
  system: boolean
}

export type TimelinePage = { entries: TimelineEntry[]; hasMore: boolean }

export type FollowUp = {
  id: string
  title: string
  status: string
  priority: string
  dueAt: string | null
  assignee: string | null
  done: boolean
}

export type TeamMemberOption = { id: string; name: string }

export type RecordWorkspace = {
  kind: ParentKind
  id: string
  currentUserId: string
  /** Owners and admins may edit or delete any logged entry. */
  canModerate: boolean
  /** Where contacts live for this page, or null when there is nowhere to add one. */
  contactParent: { kind: 'client' | 'lead'; id: string } | null
  /** Shown above the contacts when they are not on this record itself. */
  contactsNote: string | null
  contacts: Contact[]
  timeline: TimelinePage
  followUps: FollowUp[]
  teamMembers: TeamMemberOption[]
  defaultAssigneeId: string | null
  /** For a lead page: set once converted. */
  conversion: { convertedAt: string; clientId: string | null; opportunityId: string | null } | null
  /** Facts the page header needs. */
  record: { archived: boolean; status: string | null; stage: string | null; lostReason: string | null }
}
