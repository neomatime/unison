import { JobsPage } from '@/features/platform-automation/components/platform-pages'

export default async function Page({ searchParams }: { searchParams: Promise<{ queued?: string }> }) {
  const { queued } = await searchParams
  return <JobsPage queued={queued === '1'} />
}
