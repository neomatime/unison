import { WorkPage } from '@/components/shared/work-page'
import { formatAmount } from '@/features/documents/document-view'
import { getForecast } from '../queries/get-forecast'
import type { ForecastBlock, ForecastLine } from '../build-forecast'

const HEADINGS = ['Month', 'Collected', 'Due from invoices', 'Pipeline (weighted)']

const EXPLANATION = [
  'Collected: payments received in the month (voided payments are left out).',
  'Due from invoices: the balance still owing on issued, partly paid and overdue invoices, in the month the invoice is due; anything already overdue counts in this month.',
  'Pipeline: open opportunities as expected value times probability, in the month they are expected to close; one expected earlier than this month counts in this month; one with no expected close is shown on the No date line.',
  'Each currency is shown on its own and never added to another.',
]

function Figures({ line }: { line: ForecastLine }) {
  return (
    <>
      <td className="px-5 py-4 text-right tabular-nums">{formatAmount(line.collected)}</td>
      <td className="px-5 py-4 text-right tabular-nums">{formatAmount(line.due)}</td>
      <td className="px-5 py-4 text-right tabular-nums">{formatAmount(line.pipeline)}</td>
    </>
  )
}

function Figure({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-light tracking-tight text-foreground tabular-nums">
        <span className="mr-1.5 text-sm text-muted-foreground">{currency}</span>
        {formatAmount(value)}
      </p>
    </div>
  )
}

function CurrencyBlock({ block }: { block: ForecastBlock }) {
  return (
    <section aria-labelledby={`forecast-${block.currency}`} className="border border-border bg-card">
      <h2 id={`forecast-${block.currency}`} className="px-5 pt-5 text-sm font-medium text-foreground">{block.currency}</h2>
      <div className="grid gap-6 px-5 py-5 sm:grid-cols-3">
        <Figure label="Collected" value={block.totals.collected} currency={block.currency} />
        <Figure label="Due from invoices" value={block.totals.due} currency={block.currency} />
        <Figure label="Pipeline (weighted)" value={block.totals.pipeline} currency={block.currency} />
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Forecast in {block.currency}, month by month</caption>
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              {HEADINGS.map((heading, index) => (
                <th key={heading} scope="col" className={`px-5 py-3 font-medium ${index === 0 ? '' : 'text-right'}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {block.months.map((month) => (
              <tr key={month.month} className={month.isCurrent ? 'bg-brand/5' : ''}>
                <th scope="row" className="px-5 py-4 font-medium text-foreground">
                  {month.label}
                  {month.isCurrent ? <span className="ml-2 text-xs font-medium text-brand">This month</span> : null}
                </th>
                <Figures line={month} />
              </tr>
            ))}
            {block.later ? (
              <tr>
                <th scope="row" className="px-5 py-4 font-medium text-foreground">Later</th>
                <Figures line={block.later} />
              </tr>
            ) : null}
            {block.undated ? (
              <tr>
                <th scope="row" className="px-5 py-4 font-medium text-foreground">No date</th>
                <Figures line={block.undated} />
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/40 font-medium text-foreground">
              <th scope="row" className="px-5 py-4 font-medium">Total</th>
              <Figures line={block.totals} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/** The forecast: money collected, money due on invoices and the weighted pipeline, month by month. Read only. */
export async function ForecastScreen() {
  const model = await getForecast()
  return (
    <WorkPage
      category="Finance"
      title="Forecast"
      description="Worked out from your payments, your unpaid invoices and your open opportunities. Nothing here is typed in."
      parent={{ label: 'Invoices', href: '/finance/invoices' }}
    >
      {model.blocks.length === 0 ? (
        <p className="border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          Nothing to forecast yet: record payments, issue invoices or add opportunities with an expected close date.
        </p>
      ) : (
        model.blocks.map((block) => <CurrencyBlock key={block.currency} block={block} />)
      )}
      <details className="group border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          How this is worked out
          <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="list-disc space-y-2 border-t border-border py-4 pr-5 pl-10 text-sm leading-6 text-muted-foreground">
          {EXPLANATION.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </details>
    </WorkPage>
  )
}
