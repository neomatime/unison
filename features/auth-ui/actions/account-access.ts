'use server'

import { headers } from 'next/headers'

import { resolveAppOrigin } from '@/lib/auth/app-origin'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'

import { accountEmailSchema, passwordResetSchema } from '../schemas/account-access'

export type AccountAccessState = {
  error?: string
  sent?: boolean
  updated?: boolean
}

async function callbackUrl(next: string, flow: 'recovery' | 'verification') {
  const requestOrigin = (await headers()).get('origin')
  const origin = resolveAppOrigin(readAppUrl(process.env), requestOrigin)
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('next', next)
  callback.searchParams.set('flow', flow)
  return callback.toString()
}

export async function requestPasswordResetAction(
  _previous: AccountAccessState | undefined,
  formData: FormData,
): Promise<AccountAccessState> {
  const email = accountEmailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: email.error.issues[0].message }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: await callbackUrl('/reset-password', 'recovery'),
  })

  if (error) {
    console.warn('[password-reset] reset email request failed:', error.code ?? error.name)
    return { error: 'A reset email could not be sent right now. Please try again shortly.' }
  }

  // Supabase deliberately does not disclose whether the address exists. Keep
  // the application response equally neutral to prevent account enumeration.
  return { sent: true }
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
