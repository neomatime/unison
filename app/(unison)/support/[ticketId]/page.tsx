import { WorkPage } from '@/components/shared/work-page'
import { getSupportTicket, supportReference } from '@/features/collaboration/support'

export default async function Page({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  const ticket = await getSupportTicket(ticketId)
  return <WorkPage category="Help & Support" title={supportReference(ticket.ticket_number)} description={ticket.subject} parent={{ label: 'Support', href: '/support' }} guidance={<><p className="font-semibold text-foreground">Request status</p><p className="mt-2">This request is <strong>{ticket.status}</strong>. Updates are retained in your organization workspace.</p></>}><section className="border border-border bg-card p-6 lg:p-8"><div className="grid gap-4 border-b border-border pb-6 sm:grid-cols-3"><Info label="Category" value={ticket.category} /><Info label="Priority" value={ticket.priority} /><Info label="Status" value={ticket.status} /></div><div className="py-6"><p className="unison-metric-label text-xs text-muted-foreground">Request details</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{ticket.description}</p></div>{ticket.resolution ? <div className="border-t border-border pt-6"><p className="unison-metric-label text-xs text-muted-foreground">Resolution</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{ticket.resolution}</p></div> : null}<p className="mt-8 text-xs text-muted-foreground">Created {new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(ticket.created_at))}</p></section></WorkPage>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div> }
