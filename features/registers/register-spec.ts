// One definition per register, used by the screen, the page query and the export, so what matches can never differ
// between them. Plain constants: no directive, no imports (loadable by unit tests).

export const REGISTER_KINDS = ['lead', 'quote', 'opportunity', 'invoice', 'expense'] as const
export type RegisterKind = (typeof REGISTER_KINDS)[number]
export type SortDir = 'asc' | 'desc'

export function isRegisterKind(value: unknown): value is RegisterKind {
  return typeof value === 'string' && (REGISTER_KINDS as readonly string[]).includes(value)
}

export type RegisterSpec = {
  table: string
  /** The id of the export collection (features/data-portability/portable-collections.ts). */
  collection: string
  searchColumns: readonly string[]
  statusColumn: string
  statuses: readonly string[]
  ownerColumn: string
  /** Screen column id -> database column. Only these can be sorted. */
  sortable: Readonly<Record<string, string>>
  defaultSort: { column: string; dir: SortDir }
}

export const REGISTERS: Record<RegisterKind, RegisterSpec> = {
  lead: {
    table: 'leads',
    collection: 'leads',
    searchColumns: ['company_name', 'contact_name', 'contact_email'],
    statusColumn: 'status',
    statuses: ['New', 'Contacted', 'Qualified', 'Disqualified', 'Converted'],
    ownerColumn: 'owner_id',
    sortable: { name: 'company_name', contact: 'contact_name', source: 'source', value: 'estimated_value', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  quote: {
    table: 'quotes',
    collection: 'quotes',
    searchColumns: ['quote_number', 'client_name'],
    statusColumn: 'status',
    statuses: ['Draft', 'Internal Review', 'Sent', 'Accepted', 'Declined', 'Expired', 'Superseded'],
    ownerColumn: 'owner_id',
    sortable: { name: 'quote_number', client: 'client_name', total: 'total_amount', expiry: 'valid_until', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  opportunity: {
    table: 'sales_opportunities',
    collection: 'sales-opportunities',
    searchColumns: ['name', 'client_name'],
    statusColumn: 'stage',
    statuses: ['Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    ownerColumn: 'owner_id',
    sortable: { name: 'name', client: 'client_name', stage: 'stage', value: 'expected_value', probability: 'probability_percent', close: 'expected_close' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  invoice: {
    table: 'invoices',
    collection: 'invoices',
    searchColumns: ['invoice_number', 'client_name'],
    statusColumn: 'status',
    statuses: ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
    ownerColumn: 'owner_id',
    sortable: { name: 'invoice_number', client: 'client_name', issueDate: 'issue_date', due: 'due_date', total: 'total_amount', balance: 'balance_amount', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  expense: {
    table: 'expenses',
    collection: 'expenses',
    searchColumns: ['description', 'vendor_name', 'category'],
    statusColumn: 'status',
    statuses: ['Draft', 'Submitted', 'Awaiting Approval', 'Approved', 'Rejected'],
    ownerColumn: 'submitted_by',
    sortable: { name: 'description', category: 'category', vendor: 'vendor_name', amount: 'amount', date: 'expense_date', status: 'status' },
    defaultSort: { column: 'expense_date', dir: 'desc' },
  },
}
