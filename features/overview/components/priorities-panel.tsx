import { priorities } from '@/features/overview/data'
import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'
import { cn } from '@/lib/utils'

export function PrioritiesPanel() {
  return (
    <ContentPanel title="Today's Priorities" action={<ViewAllLink href="/operations/tasks" />} bodyClassName="pb-2">
      <ul className="flex flex-col">
        {priorities.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0"
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  item.urgent ? 'ring-2 ring-warning/30 bg-warning' : 'bg-warning',
                )}
              />
              <span className="text-sm text-foreground">{item.title}</span>
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">{item.meta}</span>
          </li>
        ))}
      </ul>
    </ContentPanel>
  )
}
