'use client'

import { useId, useMemo, useState } from 'react'

import { buildRevenueChart, CHART_PERIODS, formatMoney, niceMax, type ChartPeriod } from '../metrics'
import type { RevenueChartData } from '../types'
import { Panel } from './panel'

const selectClass = 'h-9 rounded-none border border-border bg-card px-2.5 text-xs font-medium text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand'

export function RevenueOverview({ data }: { data: RevenueChartData }) {
  const periodId = useId()
  const currencyId = useId()
  const [period, setPeriod] = useState<ChartPeriod>('this-year')
  const [currency, setCurrency] = useState<string | null>(null)
  const chart = useMemo(() => buildRevenueChart(data, period, currency), [data, period, currency])
  const ceiling = niceMax(Math.max(0, ...chart.buckets.map((bucket) => Math.max(bucket.won, bucket.pipeline ?? 0))))
  const money = (amount: number) => (chart.currency ? formatMoney(amount, chart.currency, 'compact') : '')
  const percent = (amount: number) => `${Math.min(100, (amount / ceiling) * 100)}%`
  const { pipelineNotCharted: notCharted } = data
  const notChartedTotal = notCharted.noCloseDate + notCharted.pastCloseDate + notCharted.nextYearOrLater

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {chart.currencies.length > 1 ? (
        <>
          <label htmlFor={currencyId} className="sr-only">Currency</label>
          <select id={currencyId} value={chart.currency ?? ''} onChange={(event) => setCurrency(event.target.value)} className={selectClass}>
            {chart.currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </>
      ) : null}
      <label htmlFor={periodId} className="sr-only">Period</label>
      <select id={periodId} value={period} onChange={(event) => setPeriod(event.target.value as ChartPeriod)} className={selectClass}>
        {CHART_PERIODS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </div>
  )

  return (
    <Panel title="Revenue overview" description="Sales booked (opportunities marked Won), not invoiced or collected cash." action={controls}>
      <div className="px-5 py-4">
        {chart.hasData ? (
          <>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <p className="font-brand text-3xl leading-none font-medium text-foreground">{formatMoney(chart.wonTotal, chart.currency ?? 'ZAR', 'compact')}</p>
                <p className="mt-1 text-xs text-[var(--briefing-muted)]">Won in this period{chart.currencies.length > 1 ? ` (${chart.currency} only)` : ''}</p>
              </div>
              {chart.pipelineShown ? (
                <div>
                  <p className="font-brand text-xl leading-none font-medium text-foreground">{money(chart.pipelineTotal)}</p>
                  <p className="mt-1 text-xs text-[var(--briefing-muted)]">Open pipeline expected to close</p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[19rem]">
                <div className="flex gap-2">
                  <div aria-hidden="true" className="flex h-44 w-14 shrink-0 flex-col justify-between text-right text-[0.625rem] text-[var(--briefing-muted)]">
                    <span>{money(ceiling)}</span>
                    <span>{money(ceiling / 2)}</span>
                    <span>0</span>
                  </div>
                  <div role="img" aria-label={`Bar chart of won revenue${chart.pipelineShown ? ' and open pipeline' : ''} for ${CHART_PERIODS.find((option) => option.id === period)?.label.toLowerCase()}, in ${chart.currency}. The data table below has the same figures.`} className="relative flex h-44 flex-1 items-end gap-1.5 border-b border-border">
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                    {chart.buckets.map((bucket) => (
                      <div key={bucket.key} className="relative flex h-full flex-1 items-end justify-center gap-0.5">
                        <div className="w-full max-w-4 bg-brand" style={{ height: percent(bucket.won) }} title={`${bucket.label}: ${money(bucket.won)} won (${bucket.wonDeals} ${bucket.wonDeals === 1 ? 'deal' : 'deals'})`} />
                        {bucket.pipeline !== null ? (
                          <div className="w-full max-w-4 bg-brand/30" style={{ height: percent(bucket.pipeline) }} title={`${bucket.label}: ${money(bucket.pipeline)} open pipeline (${bucket.pipelineDeals} ${bucket.pipelineDeals === 1 ? 'deal' : 'deals'})`} />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div aria-hidden="true" className="mt-1.5 flex gap-2">
                  <span className="w-14 shrink-0" />
                  <div className="flex flex-1 gap-1.5">
                    {chart.buckets.map((bucket) => <span key={bucket.key} className="flex-1 text-center text-[0.625rem] text-[var(--briefing-muted)]">{bucket.label}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--briefing-muted)]">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 bg-brand" />Won revenue</span>
              {chart.pipelineShown ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 bg-brand/30" />Open pipeline, by expected close</span> : <span>Past pipeline cannot be reconstructed, so none is shown for this period.</span>}
            </div>

            <table className="sr-only">
              <caption>Revenue by period in {chart.currency}</caption>
              <thead><tr><th scope="col">Period</th><th scope="col">Won</th>{chart.pipelineShown ? <th scope="col">Open pipeline</th> : null}</tr></thead>
              <tbody>
                {chart.buckets.map((bucket) => (
                  <tr key={bucket.key}>
                    <th scope="row">{bucket.label}</th>
                    <td>{money(bucket.won)}</td>
                    {chart.pipelineShown ? <td>{bucket.pipeline === null ? 'Not available' : money(bucket.pipeline)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="py-6 text-sm text-[var(--briefing-muted)]">
            No won sales or scheduled pipeline in this period.
          </p>
        )}

        {notChartedTotal > 0 ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-[var(--briefing-muted)]">
            Not charted: {[
              notCharted.noCloseDate ? `${notCharted.noCloseDate} with no expected close date` : null,
              notCharted.pastCloseDate ? `${notCharted.pastCloseDate} past their expected close date` : null,
              notCharted.nextYearOrLater ? `${notCharted.nextYearOrLater} closing next year or later` : null,
            ].filter(Boolean).join(', ')}.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
