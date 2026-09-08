import { CollectionRecordPage } from '@/features/product-ui/components/collection-record-page'
export default async function Page({ params }: { params: Promise<{ collection: string }> }) { const { collection } = await params; return <CollectionRecordPage slug={collection} mode="create" /> }
