import { notFound } from 'next/navigation'

import { ModuleActionPage } from '@/features/product-ui/components/module-action-page'
import { moduleFixtures } from '@/features/product-ui/mocks/modules'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ searchParams }: { searchParams: Promise<{ module?: string; record?: string; action?: string; subject?: string }> }) {
  const query = await searchParams
  const module = query.module ? moduleById[query.module] : undefined
  const record = module && query.record ? moduleFixtures[module.id]?.find((item) => item.id === query.record) : undefined
  if (!module || !record || !query.action) notFound()
  return <ModuleActionPage module={module} recordId={record.id} recordName={record.name} action={query.action} subject={query.subject} />
}
