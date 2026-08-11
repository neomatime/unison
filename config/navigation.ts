import {
  BarChart3,
  BookOpen,
  Calendar,
  Compass,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Plane,
  Receipt,
  Settings,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { modules, type ModuleCategory } from '@/config/modules'

export type NavigationItem = {
  id: string
  label: string
  icon: LucideIcon
  route: string
  enabled: boolean
  active?: boolean
}

export type NavigationSection = {
  heading?: string
  items: NavigationItem[]
}

const categoryLabels: Record<ModuleCategory, string | undefined> = {
  operations: 'Operations',
  commercial: 'Commercial',
  finance: 'Finance',
  people: 'People',
  standalone: undefined,
}

const moduleIcons: Record<(typeof modules)[number]['id'], LucideIcon> = {
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  calendar: Calendar,
  leads: Target,
  quotes: FileText,
  sales: BarChart3,
  invoices: Receipt,
  expenses: Wallet,
  forecast: TrendingUp,
  team: Users,
  hr: UserCog,
  leave: Plane,
  knowledge: BookOpen,
  atlas: Compass,
}

const categories: ModuleCategory[] = ['operations', 'commercial', 'finance', 'people', 'standalone']

export const navigationSections: NavigationSection[] = [
  {
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutGrid,
        route: '/overview',
        enabled: true,
        active: true,
      },
    ],
  },
  ...categories.map((category) => ({
    heading: categoryLabels[category],
    items: modules
      .filter((module) => module.category === category)
      .map((module) => ({ ...module, icon: moduleIcons[module.id] })),
  })),
  {
    items: [
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        route: '/settings',
        enabled: true,
      },
    ],
  },
]
