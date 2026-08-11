import { automationSegments } from '@/features/overview/data'
import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'
import { DonutChart } from '@/components/ui/donut-chart'

const toneColor: Record<'brand' | 'warning' | 'info', string> = {
  brand: 'var(--brand)',
  warning: 'var(--warning)',
  info: 'var(--info)',
}

export function AutomationStatusPanel() {
  const primary = automationSegments[0]

  return (
    <ContentPanel title="Automation Status" action={<ViewAllLink href="/settings" />}>
      <div className="flex items-center gap-6">
        <DonutChart
          size={140}
          thickness={14}
          rounded={false}
          segments={automationSegments.map((segment) => ({
            value: segment.value,
            color: toneColor[segment.tone],
          }))}
        >
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {primary.value}%
          </span>
          <span className="text-xs text-muted-foreground">{primary.label}</span>
        </DonutChart>

        <ul className="flex flex-1 flex-col gap-3">
          {automationSegments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: toneColor[segment.tone] }}
              />
              <span className="flex-1 text-foreground">{segment.label}</span>
              <span className="font-semibold text-foreground">{segment.value}%</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        134 automations executed in the last 24h
      </p>
    </ContentPanel>
  )
}
