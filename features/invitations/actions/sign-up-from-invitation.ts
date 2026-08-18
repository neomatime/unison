'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session-context'
import { createInvitedAccount } from '@/lib/invitations/create-invited-account'
import { createServerSupabase } from '@/lib/supabase/server'
import { invitationSignUpSchema } from '../schemas/signup'

/**
 * Creates an account for an invited address and accepts the invitation in one
 * step, so a genuinely new person can get in. Sign-up was removed from this
 * product deliberately; this is not its return. Account creation is reachable
 * only by presenting a token that resolves to a pending, unexpired invitation,
 * and only ever creates the address that invitation names.
 */
export async function signUpFromInvitationAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  // 1. Validate.
  const parsed = invitationSignUpSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // 2. Authorise + create. The token is the authorisation; the address comes
  // from the invitation, never from the form.
  const created = await createInvitedAccount({
    rawToken: parsed.data.token,
    password: parsed.data.password,
  })
  if ('error' in created) return { error: created.error }

  // 3. Sign the new account in so the RPC below has an authenticated caller.
  const supabase = await createServerSupabase()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: created.email,
    password: parsed.data.password,
  })
  if (signInError) {
    // The account exists at this point, so send them to sign in rather than
    // leaving them stranded or trying to create it a second time.
    return { error: 'Your account was created, but signing in failed. Try signing in directly.' }
  }

  // 4. Accept. Every check stays in the database — the RPC re-verifies the
  // token, that the invitation is still pending and unexpired, and that it was
  // addressed to this caller. None of it is trusted from here.
  const { data: organizationId, error: acceptError } = await supabase.rpc('accept_invitation', {
    raw_token: parsed.data.token,
  })
  if (acceptError) return { error: acceptError.message }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId as string, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })

  redirect('/overview')
}
