import { AuthScreen } from '@/features/auth-ui/auth-screen'

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <AuthScreen kind="sign-in" next={next} />
}
