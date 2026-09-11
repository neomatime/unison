'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const items = [
  { href: '/settings', label: 'Overview' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/automations', label: 'Automations' },
  { href: '/settings/jobs', label: 'Jobs & schedules' },
]

export function AutomationSettingsNav() {
  const pathname = usePathname()
  return <nav aria-label="Platform settings" className="mb-5 overflow-x-auto border-b border-border">
    <div className="flex min-w-max items-end gap-1">
      {items.map((item) => {
        const active = item.href === '/settings' ? pathname === item.href : pathname.startsWith(item.href)
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn(
          'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
          active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        )}>{item.label}</Link>
      })}
    </div>
  </nav>
}
