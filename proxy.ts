import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/forgot-password']
// Reachable while signed in: an existing user joining a second organization,
// and links that arrive in an already-authenticated session.
const AUTH_EXEMPT = ['/accept-invitation', '/verify-email', '/reset-password']

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

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (AUTH_EXEMPT.some((p) => path.startsWith(p))) return response

  if (!user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', path)
    return withRefreshedCookies(NextResponse.redirect(url), response)
  }

  if (user && PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/overview'
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|brand|avatars|placeholder).*)'],
}
