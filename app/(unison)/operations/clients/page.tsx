import { ModuleWorkspace } from '@/features/product-ui/components/module-workspace'
import { moduleById } from '@/features/product-ui/registry'
import { listClients } from '@/features/clients/queries/list-clients'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : undefined
  const page = parsedPage !== undefined && Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined

  const { records, total, page: resolvedPage, pageSize } = await listClients({ q, status, sort, page })

  return <ModuleWorkspace module={moduleById.clients} records={records} connected initialQuery={q} total={total} page={resolvedPage} pageSize={pageSize} />
}
