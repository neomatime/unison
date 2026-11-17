'use server'

import { callbackUrl } from '@/features/auth-ui/callback-url'
import { RESET_LINK_DENIED_MESSAGE, canSendResetLink } from '@/features/auth-ui/password-policy'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type SendResetLinkResult = { ok: true; email: string } | { ok: false; error: string }

/**
 * An Owner or Admin sends a member a link to set a new password. The person is looked up in this workspace's own member list (the
 * caller never supplies an email address), must be an active member, and the caller's role must allow it (an Admin cannot reset an
 * Owner). The email comes from Supabase and opens the reset page, which accepts only a session started from that link.
 */
export async function sendPasswordResetLinkAction(userId: string): Promise<SendResetLinkResult> {
  if (!isUuid(userId)) return { ok: false, error: 'That person could not be found.' }
  const { role } = await getSessionContext()
  const members = await listOrganizationMembers()
  const target = members.find((member) => member.userId === userId)
  if (!target || target.status !== 'active' || !target.email) return { ok: false, error: 'That person is not an active member of this workspace, or has no email address on file.' }
  if (!canSendResetLink(role, target.roleId)) return { ok: false, error: RESET_LINK_DENIED_MESSAGE }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(target.email, { redirectTo: await callbackUrl('/reset-password', 'recovery') })
  if (error) {
    console.warn('[password-reset] admin reset link failed:', error.code ?? error.name)
    const limited = error.code === 'over_email_send_rate_limit' || error.status === 429
    return { ok: false, error: limited ? 'A reset link was sent to this person a moment ago. Wait a minute before sending another.' : 'The reset link could not be sent right now. Try again shortly.' }
  }
  return { ok: true, email: target.email }
}
