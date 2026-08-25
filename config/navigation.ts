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

import { modules } from '@/config/modules'

export type NavigationItem = {
  id: (typeof modules)[number]['id']
  label: string
  icon: LucideIcon
  route: string
  enabled: boolean
}

export type NavigationSection = {
  heading: 'Delivery' | 'Operations' | 'Commercial' | 'Finance' | 'People'
  items: NavigationItem[]
}

const moduleIcons: Record<(typeof modules)[number]['id'], LucideIcon> = {
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

const itemsFor = (category: (typeof modules)[number]['category']) => modules
  .filter((module) => module.category === category && module.enabled)
  .map((module) => ({ ...module, icon: moduleIcons[module.id] }))

export const navigationSections: NavigationSection[] = [
  { heading: 'Delivery', items: itemsFor('delivery') },
  { heading: 'Operations', items: itemsFor('operations') },
  { heading: 'Commercial', items: itemsFor('commercial') },
  { heading: 'Finance', items: itemsFor('finance') },
  { heading: 'People', items: itemsFor('people') },
]
