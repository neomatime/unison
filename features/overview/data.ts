import {
  Briefcase,
  Zap,
  Lightbulb,
  CheckSquare,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectStatus } from '@/config/statuses'

export type Sparkline = number[]

const revenueTrend: Sparkline = [12, 18, 15, 22, 20, 28, 26, 34, 30, 42, 46, 58]
const mrrTrend: Sparkline = [20, 22, 21, 25, 24, 27, 30, 29, 33, 35, 38, 44]
const cashTrend: Sparkline = [30, 26, 34, 28, 40, 36, 44, 38, 48, 42, 52, 60]

export type KpiCard = {
  id: string
  label: string
  info?: boolean
} & (
  | { kind: 'gauge'; value: string; delta: string; deltaLabel: string; percent: number }
  | { kind: 'trend'; value: string; delta: string; deltaLabel: string; trend: Sparkline }
  | { kind: 'icon'; value: string; caption: string; icon: LucideIcon; tone: 'neutral' | 'brand' | 'warning' }
)

export const kpiCards: KpiCard[] = [
  {
    id: 'health',
    label: 'Business Health',
    kind: 'gauge',
    value: '98%',
    delta: '4%',
    deltaLabel: 'vs last week',
    percent: 98,
    info: true,
  },
  {
    id: 'revenue',
    label: 'Revenue (MTD)',
    kind: 'trend',
    value: 'R1.2M',
    delta: '18%',
    deltaLabel: 'vs last month',
    trend: revenueTrend,
  },
  {
    id: 'mrr',
    label: 'MRR',
    kind: 'trend',
    value: 'R860K',
    delta: '12%',
    deltaLabel: 'vs last month',
    trend: mrrTrend,
  },
  {
    id: 'cash',
    label: 'Cash Flow',
    kind: 'trend',
    value: 'R320K',
    delta: '8%',
    deltaLabel: 'vs last month',
    trend: cashTrend,
  },
  {
    id: 'projects',
    label: 'Projects',
    kind: 'icon',
    value: '14',
    caption: 'Active',
    icon: Briefcase,
    tone: 'neutral',
  },
  {
    id: 'automation',
    label: 'Automation',
    kind: 'icon',
    value: '97%',
    caption: 'Successful',
    icon: Zap,
    tone: 'brand',
  },
  {
    id: 'ai',
    label: 'AI Insights',
    kind: 'icon',
    value: '3',
    caption: 'New insights',
    icon: Lightbulb,
    tone: 'warning',
  },
  {
    id: 'tasks',
    label: 'Executive Tasks',
    kind: 'icon',
    value: '5',
    caption: 'Action required',
    icon: CheckSquare,
    tone: 'warning',
  },
]

export type Priority = {
  id: string
  title: string
  meta: string
  urgent?: boolean
}

export const priorities: Priority[] = [
  { id: 'p1', title: 'Approve proposal for LGNDRY.CO', meta: 'Due today' },
  { id: 'p2', title: 'Review Q2 marketing spend', meta: 'Due today' },
  { id: 'p3', title: 'Client meeting with Growthpoint', meta: '10:00 AM', urgent: true },
  { id: 'p4', title: 'Approve 3 invoices', meta: 'Due today' },
  { id: 'p5', title: 'Review Atlas insights', meta: 'Due today' },
]

export type { ProjectStatus } from '@/config/statuses'

export type Project = {
  id: string
  name: string
  initials: string
  progress: number
  status: ProjectStatus
}

export const projects: Project[] = [
  { id: 'pr1', name: 'LGNDRY.CO Rebrand', initials: 'L', progress: 75, status: 'On Track' },
  { id: 'pr2', name: 'Growthpoint Campaign', initials: 'G', progress: 60, status: 'On Track' },
  { id: 'pr3', name: 'HIMARK Platform', initials: 'H', progress: 40, status: 'At Risk' },
  { id: 'pr4', name: 'Atlas AI Development', initials: 'A', progress: 90, status: 'On Track' },
]

export type ActivityItem = {
  id: string
  name: string
  detail: string
  time: string
  initials: string
}

export const clientActivity: ActivityItem[] = [
  { id: 'c1', name: 'LGNDRY.CO', detail: 'Project update uploaded', time: '2m ago', initials: 'L' },
  { id: 'c2', name: 'Growthpoint Properties', detail: 'New project created', time: '15m ago', initials: 'G' },
  { id: 'c3', name: 'Pioneertown', detail: 'Invoice paid', time: '1h ago', initials: 'P' },
  { id: 'c4', name: 'The Brand Architects', detail: 'New message', time: '2h ago', initials: 'BA' },
  { id: 'c5', name: 'Velocity Ventures', detail: 'Document shared', time: '3h ago', initials: 'VV' },
]

export type Insight = {
  id: string
  title: string
  tone: 'brand' | 'info' | 'warning'
}

export const atlasInsights: Insight[] = [
  {
    id: 'i1',
    title: 'Revenue is up 18% this month, driven by Growthpoint campaign.',
    tone: 'brand',
  },
  {
    id: 'i2',
    title: 'Marketing conversion rate dropped 6% compared to last month.',
    tone: 'info',
  },
  {
    id: 'i3',
    title: '3 projects are at risk of delay.',
    tone: 'warning',
  },
]

export type AutomationSegment = {
  label: string
  value: number
  tone: 'brand' | 'warning' | 'info'
}

export const automationSegments: AutomationSegment[] = [
  { label: 'Successful', value: 97, tone: 'brand' },
  { label: 'Failed', value: 2, tone: 'warning' },
  { label: 'Pending', value: 1, tone: 'info' },
]

export type RecentActivity = {
  id: string
  title: string
  time: string
  icon: 'invoice' | 'proposal' | 'lead' | 'task' | 'insight'
}

export const recentActivity: RecentActivity[] = [
  { id: 'r1', title: 'Invoice INV-1247 paid by LGNDRY.CO', time: '2m ago', icon: 'invoice' },
  { id: 'r2', title: 'Proposal sent to Growthpoint Properties', time: '15m ago', icon: 'proposal' },
  { id: 'r3', title: 'New lead: Velocity Ventures', time: '1h ago', icon: 'lead' },
  { id: 'r4', title: 'Project task completed: Wireframes', time: '2h ago', icon: 'task' },
  { id: 'r5', title: 'Atlas insight generated', time: '2h ago', icon: 'insight' },
]
