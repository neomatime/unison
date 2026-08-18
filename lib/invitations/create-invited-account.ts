import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Creates the account an invitation is addressed to.
 *
 * WHY THIS LIVES IN lib/ AND NOT features/
 * A unit test forbids anything under features/ from importing the service-role
 * client, because feature code must never casually hold something that
 * bypasses RLS. Creating a confirmed auth user genuinely requires it — the
 * anon key cannot — so the capability is isolated here: one function, one
 * purpose, returning nothing but an email address. The calling server action
 * orchestrates; it never touches the admin client itself. If this file grows a
 * second responsibility, that is the signal it has become the thing the test
 * was written to prevent.
 *
 * WHY THE ACCOUNT IS CREATED PRE-CONFIRMED
 * The invitation token is 256 bits from a CSPRNG and was delivered to exactly
 * one place: the invited mailbox. Presenting it back is therefore proof of
 * control of that address — the same proof a confirmation email would provide,
 * already furnished. Requiring a second round trip through Supabase's own
 * mailer would add a step that proves nothing new, and would do it through the
 * unbranded sender this project deliberately moved away from.
 *
 * The address is taken from the invitation, never from the submitted form. A
 * caller cannot create an account for an address other than the one their
 * token names.
 */
export async function createInvitedAccount(input: {
  rawToken: string
  password: string
}): Promise<{ email: string } | { error: string }> {
  // Resolve the token first. invitation_preview is granted to anon precisely
  // so this works before any account exists, and returns zero rows for an
  // unknown, expired, revoked or accepted token alike.
  const anon = await createServerSupabase()
  const { data, error } = await anon.rpc('invitation_preview', { raw_token: input.rawToken })

  if (error) return { error: 'This invitation could not be checked. Try the link again.' }

  const invitation = data?.[0]
  if (!invitation) {
    return { error: 'This invitation is no longer valid. Ask whoever invited you for a new one.' }
  }

  const admin = createAdminSupabase()
  const { error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: input.password,
    email_confirm: true,
  })

  if (createError) {
    // Supabase reports an existing address here. Saying so is not an account
    // oracle in this context: the caller already holds a valid token naming
    // this exact address, so they learn nothing they were not told by email.
    if (/already/i.test(createError.message)) {
      return { error: 'An account already exists for this address. Sign in instead and the invitation will still be waiting.' }
    }
    return { error: 'The account could not be created. Try again, or ask for a new invitation.' }
  }

  return { email: invitation.email }
}
