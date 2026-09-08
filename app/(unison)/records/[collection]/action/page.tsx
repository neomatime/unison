import { CollectionActionPage } from '@/features/product-ui/components/collection-workflow-pages'

export default async function Page({ params, searchParams }: { params: Promise<{ collection: string }>; searchParams: Promise<{ action?: string; record?: string }> }) {
  const [{ collection }, query] = await Promise.all([params, searchParams])
  return <CollectionActionPage slug={collection} action={query.action ?? 'Record action'} record={query.record ?? 'Selected record'} />
}
