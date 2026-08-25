import { InternalSignInScreen } from '@/features/auth-ui/internal-sign-in-screen'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { signInErrorMessage } from '@/lib/auth/sign-in-error-message'

export default async function InternalSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const destination = safeRedirectPath(next ?? '/internal/overview')

  return <InternalSignInScreen next={destination} message={signInErrorMessage(error)} />
}

