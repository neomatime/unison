import { PersistentTeamScreen } from '@/features/operations/components/phase-four-register'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return <PersistentTeamScreen initialTab={tab} />
}
