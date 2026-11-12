import { WorkPage } from '@/components/shared/work-page'
import { StatusDot } from '@/components/ui/status-dot'
import { getSupportTicket, supportReference } from '@/features/collaboration/support'

export default async function Page({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  const ticket = await getSupportTicket(ticketId)
  return (
    <WorkPage category="Help & Support" title={supportReference(ticket.ticket_number)} description={ticket.subject} parent={{ label: 'Support', href: '/support' }}>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <aside aria-label="Request details" className="border border-border bg-card p-6">
          <h2 className="text-sm font-medium text-foreground">Details</h2>
          <dl className="mt-4 space-y-5">
            <Info label="Category" value={ticket.category} />
            <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="mt-1"><StatusDot status={ticket.priority} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusDot status={ticket.status} /></dd></div>
            <Info label="Created" value={new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(ticket.created_at))} />
          </dl>
        </aside>
        <div className="min-w-0 space-y-5">
          <section className="border border-border bg-card p-6">
            <h2 className="text-sm font-medium text-foreground">Request</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{ticket.description}</p>
          </section>
          {ticket.resolution ? (
            <section className="border border-border bg-card p-6">
              <h2 className="text-sm font-medium text-foreground">Resolution</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{ticket.resolution}</p>
            </section>
          ) : null}
        </div>
      </div>
    </WorkPage>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm break-words">{value}</dd></div> }
