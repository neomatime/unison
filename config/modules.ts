export const moduleCategories = ['delivery', 'operations', 'commercial', 'finance', 'people'] as const

export type ModuleCategory = (typeof moduleCategories)[number]

export type UnisonModule = {
  id: string
  label: string
  enabled: boolean
  route: string
  category: ModuleCategory
}

export const modules = [
  { id: 'overview', label: 'Overview', enabled: true, route: '/overview', category: 'delivery' },
  { id: 'portfolio', label: 'Portfolio', enabled: true, route: '/delivery/portfolio', category: 'delivery' },
  { id: 'projects', label: 'Projects', enabled: true, route: '/operations/projects', category: 'delivery' },
  { id: 'frameworks', label: 'Frameworks', enabled: true, route: '/delivery/frameworks', category: 'delivery' },
  { id: 'approvals', label: 'Approvals', enabled: true, route: '/delivery/approvals', category: 'delivery' },
  { id: 'vendors', label: 'Vendors', enabled: true, route: '/delivery/vendors', category: 'delivery' },
  { id: 'clients', label: 'Clients', enabled: true, route: '/operations/clients', category: 'operations' },
  { id: 'onboarding', label: 'Onboarding', enabled: true, route: '/operations/onboarding', category: 'operations' },
  { id: 'leads', label: 'Leads', enabled: true, route: '/commercial/leads', category: 'commercial' },
  { id: 'quotes', label: 'Quotes', enabled: true, route: '/commercial/quotes', category: 'commercial' },
  { id: 'sales', label: 'Sales', enabled: true, route: '/commercial/sales', category: 'commercial' },
  { id: 'invoices', label: 'Invoices', enabled: true, route: '/finance/invoices', category: 'finance' },
  { id: 'expenses', label: 'Expenses', enabled: true, route: '/finance/expenses', category: 'finance' },
  { id: 'forecast', label: 'Forecast', enabled: true, route: '/finance/forecast', category: 'finance' },
  { id: 'team', label: 'Team', enabled: true, route: '/people/team', category: 'people' },
] as const satisfies readonly UnisonModule[]
