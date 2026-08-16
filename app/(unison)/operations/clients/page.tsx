import { ModuleWorkspace } from '@/features/product-ui/components/module-workspace'
import { moduleById } from '@/features/product-ui/registry'
import { listClients } from '@/features/clients/queries/list-clients'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const page = typeof params.page === 'string' ? Number(params.page) : undefined

  const { records } = await listClients({ q, status, sort, page })

  return <ModuleWorkspace module={moduleById.clients} records={records} connected />
}
