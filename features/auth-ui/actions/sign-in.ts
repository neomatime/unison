'use server'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'

export async function signInAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const rawNext = formData.get('next')
  const next = safeRedirectPath(typeof rawNext === 'string' ? rawNext : undefined)

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'That email and password combination was not recognised.' }

  redirect(next)
}
