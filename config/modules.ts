export const moduleCategories = ['operations', 'commercial', 'finance', 'people', 'standalone'] as const

export type ModuleCategory = (typeof moduleCategories)[number]

export type UnisonModule = {
  id: string
  label: string
  enabled: boolean
  route: string
  category: ModuleCategory
}

export const modules = [
  { id: 'clients', label: 'Clients', enabled: true, route: '/operations/clients', category: 'operations' },
  { id: 'projects', label: 'Projects', enabled: true, route: '/operations/projects', category: 'operations' },
  { id: 'tasks', label: 'Tasks', enabled: true, route: '/operations/tasks', category: 'operations' },
  { id: 'calendar', label: 'Calendar', enabled: true, route: '/operations/calendar', category: 'operations' },
  { id: 'leads', label: 'Leads', enabled: true, route: '/commercial/leads', category: 'commercial' },
  { id: 'quotes', label: 'Quotes', enabled: true, route: '/commercial/quotes', category: 'commercial' },
  { id: 'sales', label: 'Sales', enabled: true, route: '/commercial/sales', category: 'commercial' },
  { id: 'invoices', label: 'Invoices', enabled: true, route: '/finance/invoices', category: 'finance' },
  { id: 'expenses', label: 'Expenses', enabled: true, route: '/finance/expenses', category: 'finance' },
  { id: 'forecast', label: 'Forecast', enabled: true, route: '/finance/forecast', category: 'finance' },
  { id: 'team', label: 'Team', enabled: true, route: '/people/team', category: 'people' },
  { id: 'hr', label: 'HR', enabled: true, route: '/people/hr', category: 'people' },
  { id: 'leave', label: 'Leave', enabled: true, route: '/people/leave', category: 'people' },
  { id: 'knowledge', label: 'Knowledge', enabled: true, route: '/knowledge', category: 'standalone' },
  { id: 'atlas', label: 'Atlas', enabled: true, route: '/atlas', category: 'standalone' },
] as const satisfies readonly UnisonModule[]
