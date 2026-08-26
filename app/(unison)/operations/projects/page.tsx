import { ProjectsScreen } from '@/features/delivery/components/projects-screen'
import { listProjects } from '@/features/delivery/queries/list-projects'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : undefined
  const page = parsedPage !== undefined && Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined

  const { records } = await listProjects({ q, status, sort, page })

  return <ProjectsScreen records={records} />
}
