// Who is listed on Settings, Users & access, and who may change what. Pure, no imports, so unit tests load it.

export type AccessMember = { userId: string; name: string; email: string | null; roleId: string; status: string }
export type AccessDirectoryPerson = { name: string; email: string }

export type AccessEntry = {
  /** A person with a UNISON login, or someone in the Microsoft directory who has not signed in yet. */
  kind: 'member' | 'directory'
  key: string
  userId: string | null
  name: string
  email: string | null
  roleId: string
  /** For a directory person: the role was chosen in advance (applied at first sign-in) rather than being the default. */
  chosenInAdvance: boolean
  signedIn: boolean
}

/** The role a person gets on first sign-in when nobody has chosen one (claim_directory_membership). */
export const DEFAULT_FIRST_SIGN_IN_ROLE = 'member'

/** Roles that can be chosen before a person has signed in. Owner is never granted in advance. */
export const ADVANCE_ROLES = ['admin', 'member'] as const

/**
 * Active members first (by name), then directory people with no login yet (by name). A directory person is matched to a member by
 * email, ignoring case, and left out when the address is on the Team page's hide list.
 */
export function buildAccessEntries(input: { members: AccessMember[]; directory: AccessDirectoryPerson[]; hidden: string[]; pending: Record<string, string> }): AccessEntry[] {
  const hidden = new Set(input.hidden.map((email) => email.toLowerCase()))
  const active = input.members.filter((member) => member.status === 'active')
  const memberEmails = new Set(active.map((member) => String(member.email ?? '').toLowerCase()).filter(Boolean))
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

  const members: AccessEntry[] = active
    .map((member) => ({ kind: 'member' as const, key: member.userId, userId: member.userId, name: member.name, email: member.email, roleId: member.roleId, chosenInAdvance: false, signedIn: true }))
    .sort(byName)
  const waiting: AccessEntry[] = input.directory
    .filter((person) => !memberEmails.has(person.email.toLowerCase()) && !hidden.has(person.email.toLowerCase()))
    .map((person) => {
      const chosen = input.pending[person.email.toLowerCase()]
      return { kind: 'directory' as const, key: person.email.toLowerCase(), userId: null, name: person.name, email: person.email.toLowerCase(), roleId: chosen ?? DEFAULT_FIRST_SIGN_IN_ROLE, chosenInAdvance: Boolean(chosen), signedIn: false }
    })
    .sort(byName)
  return [...members, ...waiting]
}

/** The database allows only an Owner to change a role, so the screen offers it to Owners only, and never for oneself. */
export function mayChangeRole(actorRole: string, actorUserId: string, targetUserId: string): boolean {
  return actorRole.toLowerCase() === 'owner' && actorUserId !== targetUserId
}

/** Owners and Admins may choose a role for someone who has not signed in yet; never Owner. */
export function mayChooseAdvanceRole(actorRole: string, roleId: string): boolean {
  const actor = actorRole.toLowerCase()
  return (actor === 'owner' || actor === 'admin') && (ADVANCE_ROLES as readonly string[]).includes(roleId)
}

export const ROLE_CHANGE_DENIED_MESSAGE = 'Only an Owner can change a person’s role.'
