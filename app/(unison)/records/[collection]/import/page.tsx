import { CollectionImportPage } from '@/features/product-ui/components/collection-workflow-pages'

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params
  return <CollectionImportPage slug={collection} />
}
