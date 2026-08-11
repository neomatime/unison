import { clientActivity } from '@/features/overview/data'
import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'
import { InitialAvatar } from '@/components/ui/initial-avatar'

export function ClientActivityPanel() {
  return (
    <ContentPanel title="Client Activity" action={<ViewAllLink href="/operations/clients" />} bodyClassName="pb-2">
      <ul className="flex flex-col">
        {clientActivity.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
          >
            <InitialAvatar initials={item.initials} className="rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
          </li>
        ))}
      </ul>
    </ContentPanel>
  )
}
