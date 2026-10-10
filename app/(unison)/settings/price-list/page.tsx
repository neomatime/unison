import { PriceListScreen } from '@/features/documents/components/price-list-screen'
import { isUuid } from '@/lib/utils'

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const { edit, saved } = await searchParams
  return <PriceListScreen editId={edit && isUuid(edit) ? edit : undefined} saved={saved} />
}
