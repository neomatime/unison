'use server'
import { createHash, randomBytes } from 'node:crypto'
import { readAppUrl } from '@/lib/env'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { inviteSchema } from '../schemas/invitation'

const EXPIRY_DAYS = 7

export async function sendInvitationAction(_prev: { error?: string; sent?: boolean } | undefined, formData: FormData) {
  // 1. Validate
  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    roleId: formData.get('roleId'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // 2. Authorise. Whether this specific caller may issue an 'owner' invite is
  // additionally enforced by the invitations_insert RLS policy (Task 9b) —
  // an admin attempting that gets 42501 from the insert below, which is
  // handled there (not duplicated here) so the DB stays the single source
  // of truth for that rule.
  const { organization, role, user } = await getSessionContext()
  if (role !== 'owner' && role !== 'admin') return { error: 'You do not have permission to invite people.' }

  const supabase = await createServerSupabase()

  // 3. Mutate.
  //
  // invitations_one_pending_per_email is a partial unique index on
  // (organization_id, lower(email)) where status = 'pending'. accept_invitation()
  // deliberately never flips a pending invitation to 'expired' on the read path
  // (doing so there would roll back inside the same transaction as the raise
  // that reports the expiry) — so an expired-but-still-'pending' row is left
  // sitting on that unique slot until something else clears it. Do that here,
  // on the sending path, which is exactly where the accept_invitation migration
  // comment says the sweep belongs: look up any pending invitation already on
  // file for this address, and if it has expired, flip it to 'expired' before
  // inserting the new one. A pending invitation that has NOT expired is left
  // alone and reported back as "already pending" — never silently replaced.
  const { data: pending, error: pendingLookupError } = await supabase
    .from('invitations')
    .select('id, email, expires_at')
    .eq('organization_id', organization.id)
    .eq('status', 'pending')
  if (pendingLookupError) return { error: 'The invitation could not be created.' }

  const targetEmail = parsed.data.email.toLowerCase()
  const stale = (pending ?? []).find((row) => row.email.toLowerCase() === targetEmail)

  if (stale) {
    if (new Date(stale.expires_at).getTime() > Date.now()) {
      return { error: 'An invitation is already pending for that address.' }
    }
    const { error: expireError } = await supabase
      .from('invitations')
      .update({ status: 'expired' })
      .eq('id', stale.id)
    if (expireError) return { error: 'The invitation could not be created.' }
  }

  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = '\\x' + createHash('sha256').update(rawToken).digest('hex')

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString()

  const { error } = await supabase.from('invitations').insert({
    organization_id: organization.id,
    email: parsed.data.email,
    role_id: parsed.data.roleId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: user.id,
  })
  if (error) {
    if (error.code === '23505') return { error: 'An invitation is already pending for that address.' }
    if (error.code === '42501') return { error: 'Only an owner can invite someone as an owner.' }
    return { error: 'The invitation could not be created.' }
  }

  const appUrl = readAppUrl(process.env)
  await sendEmail({
    to: parsed.data.email,
    template: invitationTemplate({
      organizationName: organization.name,
      acceptUrl: `${appUrl}/accept-invitation?token=${rawToken}`,
      invitedBy: user.email ?? 'A colleague',
    }),
  })

  // 4. Revalidate. No route in this task's scope renders a list of
  // invitations yet — there is nothing cached to invalidate. The next task
  // that adds an invitations list UI should add a revalidatePath() call here.

  return { sent: true }
}
