import { FileText, Send, UserPlus, CircleCheck, Sparkles } from 'lucide-react'
import { recentActivity, type RecentActivity } from '@/features/overview/data'
import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'

const iconMap: Record<RecentActivity['icon'], typeof FileText> = {
  invoice: FileText,
  proposal: Send,
  lead: UserPlus,
  task: CircleCheck,
  insight: Sparkles,
}

export function RecentActivityPanel() {
  return (
    <ContentPanel title="Recent Activity" action={<ViewAllLink />} bodyClassName="pb-2">
      <ul className="flex flex-col">
        {recentActivity.map((item) => {
          const Icon = iconMap[item.icon]
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
            </li>
          )
        })}
      </ul>
    </ContentPanel>
  )
}
