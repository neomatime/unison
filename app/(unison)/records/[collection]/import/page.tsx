import { CollectionImportPage } from '@/features/product-ui/components/collection-workflow-pages'
import { isPortableCollection, portableDefinitions } from '@/features/data-portability/portable-collections'

export default async function Page({ params, searchParams }: { params: Promise<{ collection: string }>; searchParams: Promise<{ collection?: string; return?: string }> }) {
  const { collection } = await params
  const query = await searchParams
  const requestedCollection = query.collection ?? null
  const portableCollection = isPortableCollection(requestedCollection) ? requestedCollection : undefined
  const returnHref = query.return?.startsWith('/') && !query.return.startsWith('//') ? query.return : undefined
  return <CollectionImportPage slug={collection} portableCollection={portableCollection} title={portableCollection ? portableDefinitions[portableCollection].label : undefined} returnHref={returnHref} />
}
