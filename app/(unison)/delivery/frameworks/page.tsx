import { FrameworksScreen } from '@/features/delivery/components/frameworks-screen'
import { listFrameworks } from '@/features/delivery/queries/list-frameworks'

export default async function Page() {
  const frameworks = await listFrameworks()
  return <FrameworksScreen frameworks={frameworks} />
}
