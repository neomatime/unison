// Who may change a password, and when. Pure: no directive, no imports, so unit tests load it.
//
// In UNISON a password is changed by an administrator, not by the person it belongs to. An Owner or Admin sends the person a
// reset link from Settings; the link opens the one page where a new password can be set. There is no "Forgot password?".

export const ADMIN_MANAGED_MESSAGE = 'Passwords are managed by your administrator. Ask your UNISON administrator to send you a reset link.'

/** The reset link an administrator sends is good for this long (the page and the save both enforce it). */
export const RESET_LINK_MINUTES = 60

/**
 * Whether this signed-in session may set a new password right now: only a session that was started by clicking a reset link an
 * administrator sent. A person who is simply signed in, and has not clicked such a link, cannot reach the form or save a password.
 * recovery_sent_at is when Supabase last sent the person a reset link; last_sign_in_at is when this session was started.
 */
export function mayChoosePassword(user: { recovery_sent_at?: string | null; last_sign_in_at?: string | null } | null | undefined, now: Date = new Date()): boolean {
  if (!user?.recovery_sent_at || !user.last_sign_in_at) return false
  const sent = Date.parse(user.recovery_sent_at)
  const signedIn = Date.parse(user.last_sign_in_at)
  if (!Number.isFinite(sent) || !Number.isFinite(signedIn)) return false
  const ageMinutes = (now.getTime() - sent) / 60000
  return ageMinutes >= 0 && ageMinutes <= RESET_LINK_MINUTES && signedIn >= sent - 5000
}

export type MemberRole = 'owner' | 'admin' | 'member'

/**
 * Whether the administrator may send a reset link to this member. Owners may reset anyone; an Admin may reset Members and other
 * Admins but never an Owner. Members may reset nobody. The target must be an active member of the same workspace (the caller
 * checks that against the member list).
 */
export function canSendResetLink(actorRole: string, targetRole: string): boolean {
  const actor = actorRole.toLowerCase()
  const target = targetRole.toLowerCase()
  if (actor === 'owner') return true
  if (actor === 'admin') return target !== 'owner'
  return false
}

export const RESET_LINK_DENIED_MESSAGE = 'You do not have permission to send a reset link to this person.'
