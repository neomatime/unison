// Turns the rows of public.forecast_months into the table the screen shows. Pure: no directive, no imports.
// Money is summed in whole cents so ten cents ten times is one rand.

export type ForecastRow = {
  bucket: 'month' | 'later' | 'undated'
  month: string | null
  currency: string
  collected: number | string
  invoices_due: number | string
  pipeline: number | string
}

export type ForecastLine = { collected: number; due: number; pipeline: number }
export type ForecastMonth = ForecastLine & { month: string; label: string; isCurrent: boolean }
export type ForecastBlock = {
  currency: string
  months: ForecastMonth[]
  later: ForecastLine | null
  undated: ForecastLine | null
  totals: ForecastLine
}
export type ForecastModel = { blocks: ForecastBlock[]; windowStart: string; windowEnd: string }

const cents = (raw: number | string) => Math.round(Number(raw) * 100)
const money = (value: number) => value / 100

// Fixed names, not Intl: the en-GB data in current Node and browsers writes September as "Sept", older data as "Sep".
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

function monthStart(today: string, plusMonths: number): string {
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + plusMonths, 1)).toISOString().slice(0, 10)
}

/** The three months before the current one, the current one, and the next six (ten months, South African calendar). */
export function buildForecast(rows: ForecastRow[], today: string): ForecastModel {
  const monthKeys = Array.from({ length: 10 }, (_, index) => monthStart(today, index - 3))
  const current = monthStart(today, 0)
  const currencies = [...new Set(rows.map((row) => row.currency))].sort()

  const blocks = currencies.map((currency): ForecastBlock => {
    const own = rows.filter((row) => row.currency === currency)
    const sum = (selected: ForecastRow[]) => ({
      collected: selected.reduce((total, row) => total + cents(row.collected), 0),
      due: selected.reduce((total, row) => total + cents(row.invoices_due), 0),
      pipeline: selected.reduce((total, row) => total + cents(row.pipeline), 0),
    })
    const line = (selected: ForecastRow[]): ForecastLine => {
      const total = sum(selected)
      return { collected: money(total.collected), due: money(total.due), pipeline: money(total.pipeline) }
    }
    const months = monthKeys.map((month): ForecastMonth => ({
      month,
      label: label(month),
      isCurrent: month === current,
      ...line(own.filter((row) => row.bucket === 'month' && row.month === month)),
    }))
    const laterRows = own.filter((row) => row.bucket === 'later')
    const undatedRows = own.filter((row) => row.bucket === 'undated')
    const counted = [...own.filter((row) => row.bucket === 'month' && row.month !== null && monthKeys.includes(row.month)), ...laterRows, ...undatedRows]
    return {
      currency,
      months,
      later: laterRows.length ? line(laterRows) : null,
      undated: undatedRows.length ? line(undatedRows) : null,
      totals: line(counted),
    }
  })
  return { blocks, windowStart: monthKeys[0], windowEnd: monthKeys[monthKeys.length - 1] }
}
