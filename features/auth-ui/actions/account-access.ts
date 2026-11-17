'use server'

import { createServerSupabase } from '@/lib/supabase/server'

import { callbackUrl } from '../callback-url'
import { ADMIN_MANAGED_MESSAGE, mayChoosePassword } from '../password-policy'

import { accountEmailSchema, passwordResetSchema } from '../schemas/account-access'

export type AccountAccessState = {
  error?: string
  sent?: boolean
  updated?: boolean
}

export async function requestPasswordResetAction(
  _previous: AccountAccessState | undefined,
  formData: FormData,
): Promise<AccountAccessState> {
  // Passwords are reset by an administrator (Settings, Users & access), never by the person themselves, so a visitor cannot ask for
  // a reset email here. Kept as an action only so any old form that still posts to it gets a plain answer.
  void _previous
  void formData
  return { error: ADMIN_MANAGED_MESSAGE }
}

export async function updatePasswordAction(
  _previous: AccountAccessState | undefined,
  formData: FormData,
): Promise<AccountAccessState> {
  const parsed = passwordResetSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServerSupabase()
  // Only a session started from a reset link an administrator sent may set a password. Someone who is merely signed in cannot
  // change theirs here, even by going straight to this action.
  const { data: { user } } = await supabase.auth.getUser()
  if (!mayChoosePassword(user)) return { error: ADMIN_MANAGED_MESSAGE }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    const expired = error.code === 'session_not_found' || error.code === 'bad_jwt'
    return {
      error: expired
        ? 'This reset link is invalid or has expired. Request a new password reset email.'
        : 'Your password could not be updated. Please try again.',
    }
  }

  // A recovery session has done its one job. Ending it requires the user to
  // authenticate with the new password and avoids leaving a shared browser in
  // a signed-in state after account recovery.
  const { error: signOutError } = await supabase.auth.signOut()
  if (signOutError) console.warn('[password-reset] sign-out after reset failed:', signOutError.code ?? signOutError.name)
  return { updated: true }
}

export async function resendVerificationAction(
  _previous: AccountAccessState | undefined,
  formData: FormData,
): Promise<AccountAccessState> {
  const email = accountEmailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: email.error.issues[0].message }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.data,
    options: { emailRedirectTo: await callbackUrl('/sign-in?verified=1', 'verification') },
  })

  if (error) {
    console.warn('[email-verification] resend failed:', error.code ?? error.name)
    return { error: 'A verification email could not be sent right now. Please try again shortly.' }
  }

  return { sent: true }
}
