import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Where Microsoft returns the user. Exchanges the code for a session, then
 * asks the database whether that identity corresponds to a membership.
 *
 * A caller who authenticates successfully but gets no membership holds a valid
 * session with no access, and every route would bounce them to
 * /join-organization — still a non-functional screen — producing a loop with
 * no exit. So this signs them out and rejects cleanly. That also means a
 * removed employee does not retain a session inside the app.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const origin = url.origin

  // Microsoft reports user-cancelled consent and similar here.
  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }

  const supabase = await createServerSupabase()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }

  const { data: organizationId, error: claimError } = await supabase.rpc('claim_directory_membership')

  // No organization for this domain (null) and a revoked membership (raise)
  // both end the same way for the user. Only the server-side signal differs —
  // telling someone their account is suspended tells them what they do not
  // need to know.
  if (claimError || !organizationId) {
    if (claimError) console.warn('[auth/callback] directory claim refused:', claimError.message)
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/sign-in?error=no-access`)
  }

  return NextResponse.redirect(`${origin}/overview`)
}
