import { ChevronRight, TrendingUp, TrendingDown, TriangleAlert, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { atlasInsights, type Insight } from '@/features/overview/data'
import { ContentPanel } from '@/components/ui/content-panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'

const toneIcon = {
  brand: TrendingUp,
  info: TrendingDown,
  warning: TriangleAlert,
} as const

const toneClasses: Record<Insight['tone'], string> = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
}

export function AtlasInsightsPanel() {
  return (
    <ContentPanel
      title="Atlas Insights"
      action={
        <StatusBadge tone="warning" className="gap-1">
          <RefreshCw className="size-3" />3 New
        </StatusBadge>
      }
      bodyClassName="pb-3"
    >
      <ul className="flex flex-col gap-2">
        {atlasInsights.map((insight) => {
          const Icon = toneIcon[insight.tone]
          return (
            <li key={insight.id}>
              <Link
                href={`/atlas/${insight.id}`}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-1 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    toneClasses[insight.tone],
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground text-pretty">
                    {insight.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Tap to explore
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </ContentPanel>
  )
}
