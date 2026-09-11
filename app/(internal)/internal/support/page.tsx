import { SupportCaseRegister } from '@/features/platform-admin/components/internal-screens'
import { listSupportCases, listUnlinkedSupportTickets } from '@/features/platform-admin/queries'

export default async function Page() {
  const [records, unlinkedTickets] = await Promise.all([listSupportCases(), listUnlinkedSupportTickets()])
  return <SupportCaseRegister records={records} unlinkedTickets={unlinkedTickets} />
}
