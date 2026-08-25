'use server'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signOutAction() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/sign-in')
}

export async function signOutInternalAction() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/internal/sign-in')
}
