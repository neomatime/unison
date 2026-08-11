import { AuthScreen } from '@/features/auth-ui/auth-screen'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <AuthScreen kind="sign-in" next={safeRedirectPath(next)} />
}
