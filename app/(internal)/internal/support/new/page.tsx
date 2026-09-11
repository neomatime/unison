import { SupportCasePage } from '@/features/platform-admin/components/internal-screens'
import { listPlatformOrganizations, listUnlinkedSupportTickets } from '@/features/platform-admin/queries'

export default async function Page({ searchParams }: { searchParams: Promise<{ ticketId?: string }> }) {
  const [{ ticketId }, organizations, tickets] = await Promise.all([searchParams, listPlatformOrganizations(), listUnlinkedSupportTickets()])
  return <SupportCasePage organizations={organizations} linkedTicket={tickets.find((item: { id: string }) => item.id === ticketId) ?? null} />
}
