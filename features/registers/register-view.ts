// What each register shows: its labels, its columns and how a record becomes a row of cells. Pure: no directive and
// no imports of server code. A record here is the mapped record the phase-six mappers produce.
import type { RegisterKind } from './register-spec.ts'

export type RegisterColumn = { id: string; label: string }
export type RegisterFrame = {
  category: string
  heading: string
  singular: string
  action: string
  base: string
  description: string
  empty: string
  columns: RegisterColumn[]
}
export type RegisterRow = { id: string; name: string; status: string; archived: boolean; cells: Record<string, string> }

export const REGISTER_FRAMES: Record<RegisterKind, RegisterFrame> = {
  lead: {
    category: 'Commercial', heading: 'Leads', singular: 'Lead', action: 'Add Lead', base: '/commercial/leads',
    description: 'Qualify persistent prospects, value and commercial ownership.', empty: 'Add the first commercial lead.',
    columns: [{ id: 'name', label: 'Company' }, { id: 'contact', label: 'Contact' }, { id: 'source', label: 'Source' }, { id: 'owner', label: 'Owner' }, { id: 'value', label: 'Estimated Value' }, { id: 'status', label: 'Status' }],
  },
  quote: {
    category: 'Commercial', heading: 'Quotes', singular: 'Quote', action: 'New Quote', base: '/commercial/quotes',
    description: 'Prepare and govern persistent client quotations and commercial terms.', empty: 'Create the first client quote.',
    columns: [{ id: 'name', label: 'Quote' }, { id: 'client', label: 'Client' }, { id: 'owner', label: 'Owner' }, { id: 'total', label: 'Total' }, { id: 'expiry', label: 'Expiry' }, { id: 'status', label: 'Status' }],
  },
  opportunity: {
    category: 'Commercial', heading: 'Sales', singular: 'Opportunity', action: 'New Opportunity', base: '/commercial/sales',
    description: 'Manage a persistent pipeline from discovery through commercial outcome.', empty: 'Create the first sales opportunity.',
    columns: [{ id: 'name', label: 'Opportunity' }, { id: 'client', label: 'Client / Prospect' }, { id: 'owner', label: 'Owner' }, { id: 'stage', label: 'Stage' }, { id: 'value', label: 'Value' }, { id: 'probability', label: 'Probability' }, { id: 'close', label: 'Expected Close' }],
  },
  invoice: {
    category: 'Finance', heading: 'Invoices', singular: 'Invoice', action: 'New Invoice', base: '/finance/invoices',
    description: 'Control persistent client billing, balances and payment status.', empty: 'Create the first client invoice.',
    columns: [{ id: 'name', label: 'Invoice' }, { id: 'client', label: 'Client' }, { id: 'issueDate', label: 'Issue Date' }, { id: 'due', label: 'Due Date' }, { id: 'total', label: 'Total' }, { id: 'balance', label: 'Balance' }, { id: 'status', label: 'Status' }],
  },
  expense: {
    category: 'Finance', heading: 'Expenses', singular: 'Expense', action: 'Add Expense', base: '/finance/expenses',
    description: 'Capture persistent operational spend and approval accountability.', empty: 'Add the first operational expense.',
    columns: [{ id: 'name', label: 'Expense' }, { id: 'category', label: 'Category' }, { id: 'vendor', label: 'Vendor' }, { id: 'project', label: 'Project' }, { id: 'owner', label: 'Submitted By' }, { id: 'amount', label: 'Amount' }, { id: 'date', label: 'Date' }, { id: 'status', label: 'Status' }],
  },
}

type Mapped = Record<string, unknown>
const text = (value: unknown, fallback = '—') => (value === null || value === undefined || value === '' ? fallback : String(value))
const day = (value: unknown) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA') : '—')
const amount = (value: unknown, currency: unknown) => {
  const code = text(currency, 'ZAR')
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(value ?? 0))
  } catch {
    return `${code} ${Math.round(Number(value ?? 0))}`
  }
}

export function toRegisterRow(kind: RegisterKind, record: Mapped): RegisterRow {
  const cells: Record<string, string> = { name: text(record.name) }
  switch (kind) {
    case 'lead':
      Object.assign(cells, { contact: text(record.contactName), source: text(record.source), owner: text(record.owner), value: amount(record.estimatedValue, record.currency), status: text(record.status) })
      break
    case 'quote':
      Object.assign(cells, { client: text(record.clientName), owner: text(record.owner), total: amount(record.totalAmount, record.currency), expiry: day(record.validUntil), status: text(record.status) })
      break
    case 'opportunity':
      Object.assign(cells, { client: text(record.clientName), owner: text(record.owner), stage: text(record.stage), value: amount(record.expectedValue, record.currency), probability: `${text(record.probabilityPercent, '0')}%`, close: day(record.expectedClose) })
      break
    case 'invoice':
      Object.assign(cells, { client: text(record.clientName), issueDate: day(record.issueDate), due: day(record.dueDate), total: amount(record.totalAmount, record.currency), balance: amount(record.balanceAmount, record.currency), status: text(record.status) })
      break
    case 'expense':
      Object.assign(cells, { category: text(record.category), vendor: text(record.vendor), project: text(record.project), owner: text(record.submitter), amount: amount(record.amount, record.currency), date: day(record.expenseDate), status: text(record.status) })
      break
  }
  return { id: String(record.id), name: text(record.name), status: text(record.status), archived: Boolean(record.archivedAt), cells }
}
