// Search and filters for the support list. Pure: no directive, no imports.

export type SupportFilters = { q: string; status: string; priority: string }

export const SUPPORT_STATUSES = ['Open', 'In Progress', 'Waiting on Customer', 'Resolved', 'Closed'] as const
export const SUPPORT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

type Row = { ticket_number: number; subject: string; description: string; category: string; status: string; priority: string }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** Reads the page address. An unknown status or priority is ignored rather than showing an empty list. */
export function readSupportFilters(params: Record<string, string | string[] | undefined>): SupportFilters {
  const status = one(params.status)
  const priority = one(params.priority)
  return {
    q: one(params.q).trim().slice(0, 100),
    status: (SUPPORT_STATUSES as readonly string[]).includes(status) ? status : '',
    priority: (SUPPORT_PRIORITIES as readonly string[]).includes(priority) ? priority : '',
  }
}

/** The reference people see, SUP-000012, so a search for "12" or "SUP-000012" finds it. */
const reference = (ticketNumber: number) => `SUP-${String(ticketNumber).padStart(6, '0')}`

export function filterSupportTickets<T extends Row>(tickets: readonly T[], filters: SupportFilters): T[] {
  const needle = filters.q.toLowerCase()
  return tickets.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false
    if (filters.priority && ticket.priority !== filters.priority) return false
    if (!needle) return true
    return [reference(ticket.ticket_number), String(ticket.ticket_number), ticket.subject, ticket.category, ticket.description]
      .some((text) => text.toLowerCase().includes(needle))
  })
}

export const hasSupportFilters = (filters: SupportFilters) => Boolean(filters.q || filters.status || filters.priority)
