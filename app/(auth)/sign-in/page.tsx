import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { signInErrorMessage } from '@/lib/auth/sign-in-error-message'

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  return <AuthScreen kind="sign-in" next={safeRedirectPath(next)} message={signInErrorMessage(error)} />
}
