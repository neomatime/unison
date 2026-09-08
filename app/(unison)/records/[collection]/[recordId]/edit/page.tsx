import { CollectionRecordPage } from '@/features/product-ui/components/collection-record-page'
export default async function Page({ params }: { params: Promise<{ collection: string; recordId: string }> }) { const { collection, recordId } = await params; return <CollectionRecordPage slug={collection} recordId={recordId} mode="edit" /> }
