'use server'
import { redirect } from 'next/navigation'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signInWithMicrosoftAction() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${readAppUrl(process.env)}/auth/callback`,
      // email is not in Azure's default scope set and the claim function
      // needs a verified address to match a domain against.
      scopes: 'email',
    },
  })

  if (error || !data.url) redirect('/sign-in?error=microsoft')
  redirect(data.url)
}
