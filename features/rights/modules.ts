// Which area of UNISON each register, record kind, navigation item and export belongs to. Pure, no imports.

export const REGISTER_MODULES = { lead: 'leads', quote: 'quotes', opportunity: 'sales', invoice: 'invoices', expense: 'expenses' } as const
export const PHASE_SIX_MODULES = { ...REGISTER_MODULES, forecast: 'forecasting' } as const

/** Navigation item id → the rights area it belongs to. Items not listed are not governed by area rights. */
export const NAV_MODULES: Record<string, string> = {
  overview: 'overview', team: 'team', clients: 'clients', onboarding: 'onboarding', vendors: 'vendors', calendar: 'calendar',
  leads: 'leads', acquisition: 'acquisition', quotes: 'quotes', sales: 'sales', invoices: 'invoices', expenses: 'expenses', forecast: 'forecasting',
}

/** Portable export collection → the rights area whose Export right governs it. */
export const EXPORT_MODULES: Record<string, string> = {
  leads: 'leads', quotes: 'quotes', 'sales-opportunities': 'sales', invoices: 'invoices', expenses: 'expenses', clients: 'clients', vendors: 'vendors',
}
