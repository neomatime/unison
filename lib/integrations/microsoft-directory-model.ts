// Who counts as a person in the organisation's Microsoft 365 directory. Pure, no imports, so unit tests load it.

export type DirectoryUser = { id: string; name: string; email: string; jobTitle: string | null; department: string | null }

/**
 * Keeps enabled, ordinary member accounts whose address is on the organisation's domain. Guests, disabled accounts (which is what
 * a shared mailbox that nobody signs in to usually is) and accounts with no mail address are left out. Sorted by name.
 */
export function directoryPeople(rows: unknown, domain: string | null | undefined): DirectoryUser[] {
  const wanted = String(domain ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!wanted || !Array.isArray(rows)) return []
  const people: DirectoryUser[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const email = String(row.mail ?? row.userPrincipalName ?? '').trim().toLowerCase()
    if (!email.endsWith(`@${wanted}`)) continue
    if (row.accountEnabled === false) continue
    if (row.userType && String(row.userType).toLowerCase() !== 'member') continue
    const name = String(row.displayName ?? '').trim() || email
    people.push({ id: String(row.id ?? ''), name, email, jobTitle: stringOrNull(row.jobTitle), department: stringOrNull(row.department) })
  }
  return people.sort((a, b) => a.name.localeCompare(b.name))
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

export type DirectoryResult = { ok: true; people: DirectoryUser[] } | { ok: false; reason: 'not-configured' | 'permission' | 'other' }
