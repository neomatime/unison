import {
  BadgeCheck,
  BarChart3,
  Building2,
  FileStack,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { modules } from './modules.ts'
import type { UnisonModuleId } from '@/config/unison-tiers'

export type NavigationItem = {
  id: (typeof modules)[number]['id']
  label: string
  route: string
  enabled: boolean
}

export type NavigationSection = {
  heading: 'Delivery' | 'Operations' | 'Commercial' | 'Finance' | 'People'
  items: NavigationItem[]
}

export const moduleIcons: Record<(typeof modules)[number]['id'], LucideIcon> = {
  overview: LayoutDashboard,
  portfolio: FileStack,
  projects: FolderKanban,
  frameworks: Workflow,
  approvals: BadgeCheck,
  vendors: Building2,
  clients: Users,
  onboarding: UserPlus,
  leads: Target,
  quotes: FileText,
  sales: BarChart3,
  invoices: Receipt,
  expenses: Wallet,
  forecast: TrendingUp,
  team: Users,
}

// No icon here, deliberately. These sections are now built in a Server Component
// (app/(unison)/layout.tsx) and handed to the client Sidebar through context, so
// every value must survive RSC serialisation. A Lucide icon is a function
// component; passing one across that boundary throws "Functions cannot be passed
// directly to Client Components" at request time — it compiles, it type-checks,
// and it only fails for a signed-in user. The Sidebar looks the icon up from
// `moduleIcons` by id on its own side of the boundary.
const itemsFor = (category: (typeof modules)[number]['category'], moduleIds: readonly UnisonModuleId[]) => modules
  .filter((module) => module.category === category && module.enabled && moduleIds.includes(module.id))
  .map((module) => ({ ...module }))

/**
 * Built per tenant from its tier's entitlement rather than once at import. A
 * section whose modules are all withheld is dropped entirely — an empty "Finance"
 * heading tells a Core tenant they are missing something without saying what.
 */
export function navigationSectionsFor(moduleIds: readonly UnisonModuleId[]): NavigationSection[] {
  const sections: NavigationSection[] = [
    { heading: 'Delivery', items: itemsFor('delivery', moduleIds) },
    { heading: 'Operations', items: itemsFor('operations', moduleIds) },
    { heading: 'Commercial', items: itemsFor('commercial', moduleIds) },
    { heading: 'Finance', items: itemsFor('finance', moduleIds) },
    { heading: 'People', items: itemsFor('people', moduleIds) },
  ]
  return sections.filter((section) => section.items.length > 0)
}
