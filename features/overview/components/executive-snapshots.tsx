import { CalendarDays, CircleDollarSign, Target, Users } from 'lucide-react'

const snapshots = [
  { title: 'Commercial Snapshot', value: 'R2.8M', caption: 'Weighted pipeline', detail: '4 decisions this week', icon: Target },
  { title: 'Financial Snapshot', value: 'R1.2M', caption: 'Revenue month to date', detail: '2 overdue invoices', icon: CircleDollarSign },
  { title: 'Team Snapshot', value: '86%', caption: 'Available capacity', detail: '3 people on leave', icon: Users },
  { title: 'Calendar Snapshot', value: '7', caption: 'Events today', detail: 'Next: Meridian workshop', icon: CalendarDays },
]

export function ExecutiveSnapshots() {
  return <section aria-label="Executive snapshots" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{snapshots.map(({ title, value, caption, detail, icon: Icon }) => <article key={title} className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" /></span></div><p className="mt-5 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{caption}</p><p className="mt-4 border-t border-border pt-3 text-xs font-medium text-foreground">{detail}</p></article>)}</section>
}

