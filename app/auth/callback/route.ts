import { NextResponse, type NextRequest } from 'next/server'
import { authEntryPathFor } from '@/lib/auth/auth-entry'
import { AUTH_UNAVAILABLE_ERROR, isAuthServiceUnavailable } from '@/lib/auth/auth-unavailable'
import { resolveAppOrigin } from '@/lib/auth/app-origin'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { createServerSupabase } from '@/lib/supabase/server'
import { readAppUrl } from '@/lib/env'

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
/**
 * The user-facing copy is identical for every failure, so in development the
 * cause is also carried on the URL. A dev server that has already exited takes
 * its console with it, and the address bar is the one place the reason survives
 * that. Never attached in production, where the log is the record.
 */
function signInFailure(origin: string, reason: string, next: string, error = 'microsoft'): NextResponse {
  const destination = new URL(authEntryPathFor(next), origin)
  destination.searchParams.set('error', error)
  destination.searchParams.set('next', next)
  if (process.env.NODE_ENV !== 'production') destination.searchParams.set('reason', reason)
  return NextResponse.redirect(destination)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeRedirectPath(url.searchParams.get('next'))
  // Production remains pinned to the configured app URL. A loopback origin is
  // accepted only in local development so the callback returns to whichever
  // localhost/127.0.0.1 port is serving the current preview.
  const origin = resolveAppOrigin(readAppUrl(process.env), url.origin)

  // Every failure below renders the same sentence to the user, deliberately —
  // sign-in failures should not narrate themselves to whoever is at the
  // keyboard. That makes the server log the only place the four causes can be
  // told apart, so each one has to say which it was.
  const providerError = url.searchParams.get('error')
  if (providerError) {
    console.warn('[auth/callback] provider returned an error:', providerError, url.searchParams.get('error_description') ?? '')
    return signInFailure(origin, `provider:${providerError}`, next)
  }
  if (!code) {
    console.warn('[auth/callback] no authorization code on the callback URL')
    return signInFailure(origin, 'no-code', next)
  }

  const supabase = await createServerSupabase()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    // `pkce_code_verifier_not_found` is the one worth recognising on sight: the
    // provider authenticated the user, but the verifier cookie this route needs
    // is absent, so the flow began somewhere this request cannot see — a
    // different host (the dev server's LAN address rather than localhost), a
    // different browser, or cleared cookies. It fails without reaching Supabase
    // at all, so nothing shows up in the project's auth logs to explain it.
    const reason = exchangeError.code ?? exchangeError.name
    // The verifier is host-scoped, so when it is missing the useful facts are
    // which origin this callback ran on and what the browser actually sent.
    const verifierCookies = request.cookies.getAll().map((c) => c.name).filter((n) => n.includes('code-verifier'))
    console.warn('[auth/callback] code exchange failed:', reason, '—', exchangeError.message)
    console.warn('[auth/callback] callback origin:', url.origin, '| redirecting to:', origin, '| verifier cookies present:', verifierCookies.length ? verifierCookies.join(', ') : 'none')
    // The provider authenticated the user; only this server's call to Supabase
    // failed. Saying "Microsoft sign-in didn't complete" would be false and
    // would send them back through a provider that is working.
    const unavailable = isAuthServiceUnavailable(exchangeError)
    return signInFailure(origin, reason, next, unavailable ? AUTH_UNAVAILABLE_ERROR : 'microsoft')
  }

  const { data: organizationId, error: claimError } = await supabase.rpc('claim_directory_membership')

  // No organization for this domain (null) and a revoked membership (raise)
  // both end the same way for the user. Only the server-side signal differs —
  // telling someone their account is suspended tells them what they do not
  // need to know.
  if (claimError || !organizationId) {
    if (claimError) console.warn('[auth/callback] directory claim refused:', claimError.message)
    // A failed sign-out is the one thing here that fails open — it would leave
    // a rejected caller holding a live session — so it must not be silent.
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) console.error('[auth/callback] sign-out after refusal failed:', signOutError.message)
    return signInFailure(origin, 'no-access', next, 'no-access')
  }

  return NextResponse.redirect(new URL(next, origin))
}
