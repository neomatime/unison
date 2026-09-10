import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { signInErrorMessage } from '@/lib/auth/sign-in-error-message'

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; verified?: string }> }) {
  const { next, error, verified } = await searchParams
  const message = verified === '1' ? 'Your email has been verified. Sign in to continue.' : signInErrorMessage(error)
  return <AuthScreen kind="sign-in" next={safeRedirectPath(next)} message={message} />
}
