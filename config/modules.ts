export const moduleCategories = ['delivery', 'operations', 'commercial', 'finance', 'people'] as const

export type ModuleCategory = (typeof moduleCategories)[number]

export type UnisonModule = {
  id: string
  label: string
  enabled: boolean
  route: string
  category: ModuleCategory
}

// The order of this list is the order of the sidebar within each section.
//
// Portfolio, Projects, Frameworks and Approvals keep the 'delivery' category and
// their routes, tables and tier entitlements, but the sidebar no longer renders a
// Delivery section (see config/navigation.ts), so they are reachable by URL and from
// within the CRM records that link to them, not from the menu. Vendors sits in
// 'operations' for navigation only: which tier includes it is decided by
// config/unison-tiers.ts, which this does not touch.
export const modules = [
  { id: 'overview', label: 'Overview', enabled: true, route: '/overview', category: 'delivery' },
  { id: 'portfolio', label: 'Portfolio', enabled: true, route: '/delivery/portfolio', category: 'delivery' },
  { id: 'projects', label: 'Projects', enabled: true, route: '/operations/projects', category: 'delivery' },
  { id: 'frameworks', label: 'Frameworks', enabled: true, route: '/delivery/frameworks', category: 'delivery' },
  { id: 'approvals', label: 'Approvals', enabled: true, route: '/delivery/approvals', category: 'delivery' },
  { id: 'clients', label: 'Clients', enabled: true, route: '/operations/clients', category: 'operations' },
  { id: 'onboarding', label: 'Onboarding', enabled: true, route: '/operations/onboarding', category: 'operations' },
  { id: 'vendors', label: 'Vendors', enabled: true, route: '/delivery/vendors', category: 'operations' },
  { id: 'leads', label: 'Leads', enabled: true, route: '/commercial/leads', category: 'commercial' },
  { id: 'quotes', label: 'Quotes', enabled: true, route: '/commercial/quotes', category: 'commercial' },
  { id: 'sales', label: 'Sales', enabled: true, route: '/commercial/sales', category: 'commercial' },
  { id: 'invoices', label: 'Invoices', enabled: true, route: '/finance/invoices', category: 'finance' },
  { id: 'expenses', label: 'Expenses', enabled: true, route: '/finance/expenses', category: 'finance' },
  { id: 'forecast', label: 'Forecasting', enabled: true, route: '/finance/forecast', category: 'finance' },
  { id: 'team', label: 'Team', enabled: true, route: '/people/team', category: 'people' },
] as const satisfies readonly UnisonModule[]
