import { TeamScreen } from '@/features/team/components/team-screen'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return <TeamScreen initialTab={tab} />
}
