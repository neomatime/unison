import { ContentPanel, ViewAllLink } from '@/components/ui/content-panel'
import { DonutChart } from '@/components/ui/donut-chart'
import { getAutomationMetrics } from '@/features/platform-automation/queries'

const toneColor: Record<'brand' | 'warning' | 'info', string> = {
  brand: 'var(--brand)',
  warning: 'var(--warning)',
  info: 'var(--info)',
}

export async function AutomationStatusPanel() {
  const metrics = await getAutomationMetrics()
  const total = metrics.runsLast24Hours
  const segments = [
    { label: 'Successful', value: metrics.succeededLast24Hours, tone: 'brand' as const },
    { label: 'Failed', value: metrics.failedLast24Hours, tone: 'warning' as const },
    { label: 'Queued / running', value: metrics.queuedLast24Hours, tone: 'info' as const },
  ]
  const successRate = total ? Math.round((metrics.succeededLast24Hours / total) * 100) : 0

  return (
    <ContentPanel title="Automation Status" action={<ViewAllLink href="/settings/automations" />}>
      <div className="flex items-center gap-6">
        <DonutChart
          size={140}
          thickness={14}
          rounded={false}
          segments={segments.map((segment) => ({
            value: segment.value,
            color: toneColor[segment.tone],
          }))}
        >
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {successRate}%
          </span>
          <span className="text-xs text-muted-foreground">Successful</span>
        </DonutChart>

        <ul className="flex flex-1 flex-col gap-3">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: toneColor[segment.tone] }}
              />
              <span className="flex-1 text-foreground">{segment.label}</span>
              <span className="font-semibold text-foreground">{segment.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        {total ? `${total} automation run${total === 1 ? '' : 's'} in the last 24h` : `${metrics.activeRules} active rule${metrics.activeRules === 1 ? '' : 's'} · no runs in the last 24h`}
      </p>
    </ContentPanel>
  )
}
