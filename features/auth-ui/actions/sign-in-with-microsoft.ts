'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authEntryPathFor } from '@/lib/auth/auth-entry'
import { resolveAppOrigin } from '@/lib/auth/app-origin'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signInWithMicrosoftAction(formData: FormData) {
  const next = safeRedirectPath(formData.get('next')?.toString())
  const supabase = await createServerSupabase()
  const requestOrigin = (await headers()).get('origin')
  const appOrigin = resolveAppOrigin(readAppUrl(process.env), requestOrigin)

  // signInWithOAuth stores the PKCE verifier in a host-scoped cookie on
  // whichever origin served this request, but the provider will return the user
  // to `appOrigin`. When those differ the callback cannot see the verifier and
  // the exchange fails after the user has already authenticated — so say so
  // here, where the cause is still visible, rather than leaving the callback to
  // report a symptom. In production this divergence is the point (an untrusted
  // origin must not choose the redirect); in development it usually means the
  // page was opened on the dev server's LAN address instead of localhost.
  if (requestOrigin && requestOrigin !== appOrigin) {
    console.warn(`[sign-in] request origin ${requestOrigin} is not the app origin ${appOrigin}; the PKCE verifier will be written to the former and the callback will run on the latter, which cannot read it. Start sign-in from ${appOrigin}.`)
  }
  const callbackUrl = new URL('/auth/callback', appOrigin)
  callbackUrl.searchParams.set('next', next)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: callbackUrl.toString(),
      // email is not in Azure's default scope set and the claim function
      // needs a verified address to match a domain against.
      scopes: 'email',
    },
  })

  if (error || !data.url) {
    const params = new URLSearchParams({ error: 'microsoft', next })
    redirect(`${authEntryPathFor(next)}?${params.toString()}`)
  }
  redirect(data.url)
}
