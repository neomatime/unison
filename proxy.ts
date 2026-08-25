import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authEntryPathFor, INTERNAL_HOME_PATH, INTERNAL_SIGN_IN_PATH } from '@/lib/auth/auth-entry'
import { AUTH_UNAVAILABLE_ERROR, isAuthServiceUnavailable } from '@/lib/auth/auth-unavailable'

const PUBLIC_PATHS = ['/', '/sign-in', '/forgot-password']
const AUTH_ENTRY_PATHS = ['/sign-in', '/forgot-password']
// Reachable while signed in: an existing user joining a second organization,
// and links that arrive in an already-authenticated session.
const AUTH_EXEMPT = ['/accept-invitation', '/verify-email', '/reset-password', '/auth/callback']

// A plain startsWith would also match e.g. /auth/callback-admin or
// /reset-password-debug, silently granting them the same unauthenticated
// bypass the moment such a route is ever added. Require an exact match or a
// path that continues with a "/" segment boundary.
function matchesPath(path: string, entry: string): boolean {
  return path === entry || path.startsWith(`${entry}/`)
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (AUTH_EXEMPT.some((p) => matchesPath(path, p))) return response

  const internalSignIn = path === INTERNAL_SIGN_IN_PATH
  const publicPath = internalSignIn || PUBLIC_PATHS.some((p) => matchesPath(path, p))

  if (!user && !publicPath) {
    const url = request.nextUrl.clone()
    const requestedPath = `${path}${request.nextUrl.search}`
    url.pathname = authEntryPathFor(path)
    url.search = ''
    url.searchParams.set('next', requestedPath)
    // A caller whose session simply could not be verified is not a caller
    // without one. Their cookies are untouched and still valid, so this stays a
    // redirect rather than a sign-out — but it must not accuse them of being
    // signed out, or the sign-in they attempt next will fail for the same
    // unstated reason.
    if (isAuthServiceUnavailable(authError)) {
      console.warn('[proxy] could not reach the auth service to verify the session for', path, '—', authError?.message)
      url.searchParams.set('error', AUTH_UNAVAILABLE_ERROR)
    }
    return withRefreshedCookies(NextResponse.redirect(url), response)
  }

  if (user && (internalSignIn || AUTH_ENTRY_PATHS.some((p) => matchesPath(path, p)))) {
    const url = request.nextUrl.clone()
    url.pathname = internalSignIn ? INTERNAL_HOME_PATH : '/overview'
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url), response)
  }

  return response
}

// A redirect response is a fresh NextResponse and does not carry the cookies `setAll` wrote
// onto `response` above. Since Supabase refresh tokens rotate, dropping those cookies here
// would leave the browser holding an already-consumed refresh token.
function withRefreshedCookies(redirectResponse: NextResponse, response: NextResponse) {
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie)
  return redirectResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
