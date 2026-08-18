import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { InvitationSignUpScreen } from '@/features/invitations/components/invitation-signup-screen'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  // proxy.ts exempts /accept-invitation from the sign-in redirect (an
  // invitation link must be openable while signed out), so this page — not
  // the middleware — is what decides what to show.
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  // Already signed in: accept directly. The RPC still re-checks that the
  // invitation was addressed to this account.
  if (user) return <AuthScreen kind="accept" token={token} />

  // Signed out with a token that still resolves: this is a new person, and
  // there is otherwise no way for them to get in — sign-up was removed when
  // the product became invite-only. Offer account creation, bound to the
  // address the invitation names.
  if (token) {
    const { data } = await supabase.rpc('invitation_preview', { raw_token: token })
    const invitation = data?.[0]
    if (invitation) {
      return <InvitationSignUpScreen
        token={token}
        email={invitation.email}
        organizationName={invitation.organization_name}
      />
    }
  }

  // Signed out with no token, or one that is unknown, expired, revoked or
  // already accepted. Fall back to sign-in rather than saying which — an
  // existing user whose invitation has lapsed can still get to their account,
  // and nothing here distinguishes the four failure cases.
  const next = safeRedirectPath(`/accept-invitation${token ? `?token=${encodeURIComponent(token)}` : ''}`)
  return <AuthScreen kind="sign-in" next={next} />
}
