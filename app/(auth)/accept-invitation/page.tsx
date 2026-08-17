import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  // proxy.ts exempts /accept-invitation from the sign-in redirect (an
  // invitation link must be openable while signed out), so this page — not
  // the middleware — is what decides what to show. A signed-out invitee sees
  // the existing sign-in prompt with `next` pointed back at this exact URL,
  // so they land right back here (still carrying the token) once authenticated.
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const next = safeRedirectPath(`/accept-invitation${token ? `?token=${encodeURIComponent(token)}` : ''}`)
    return <AuthScreen kind="sign-in" next={next} />
  }

  return <AuthScreen kind="accept" token={token} />
}
