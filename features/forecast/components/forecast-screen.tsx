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
      <td className="px-4 py-3 text-right tabular-nums">{formatAmount(line.collected)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatAmount(line.due)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatAmount(line.pipeline)}</td>
    </>
  )
}

function CurrencyBlock({ block }: { block: ForecastBlock }) {
  return (
    <section aria-labelledby={`forecast-${block.currency}`} className="border border-border bg-card">
      <h2 id={`forecast-${block.currency}`} className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{block.currency}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Forecast in {block.currency}, month by month</caption>
          <thead>
            <tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {HEADINGS.map((heading, index) => (
                <th key={heading} scope="col" className={`px-4 py-3 ${index === 0 ? '' : 'text-right'}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.months.map((month) => (
              <tr key={month.month} className={`border-t border-border ${month.isCurrent ? 'bg-brand/5' : ''}`}>
                <th scope="row" className="px-4 py-3 font-medium text-foreground">
                  {month.label}
                  {month.isCurrent ? <span className="ml-2 text-xs font-semibold text-brand">This month</span> : null}
                </th>
                <Figures line={month} />
              </tr>
            ))}
            {block.later ? (
              <tr className="border-t border-border">
                <th scope="row" className="px-4 py-3 font-medium text-foreground">Later</th>
                <Figures line={block.later} />
              </tr>
            ) : null}
            {block.undated ? (
              <tr className="border-t border-border">
                <th scope="row" className="px-4 py-3 font-medium text-foreground">No date</th>
                <Figures line={block.undated} />
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold text-foreground">
              <th scope="row" className="px-4 py-3">Total</th>
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
        <p className="border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing to forecast yet: record payments, issue invoices or add opportunities with an expected close date.
        </p>
      ) : (
        model.blocks.map((block) => <CurrencyBlock key={block.currency} block={block} />)
      )}
      <section aria-labelledby="forecast-how" className="border border-border bg-card p-6">
        <h2 id="forecast-how" className="text-sm font-semibold text-foreground">How this is worked out</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {EXPLANATION.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
    </WorkPage>
  )
}
