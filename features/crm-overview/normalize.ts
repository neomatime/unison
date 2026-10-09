// Turns the JSON the crm_overview_* functions return into the typed shapes the
// screens render. Deliberately strict: a malformed or missing number THROWS, so
// the section lands in its error state. Defaulting it to 0 would turn a broken
// query into a confident "0", which is the one thing this dashboard must not do.
import {
  OPEN_STAGES,
  type ActivityEvent,
  type BucketRow,
  type KpiData,
  type Money,
  type PipelineData,
  type PipelinePreview,
  type PipelineStage,
  type PipelineWon,
  type RevenueChartData,
} from './types.ts'

type Json = Record<string, unknown>

function asRecord(value: unknown, path: string): Json {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Json
  throw new Error(`crm-overview: ${path} is not an object`)
}

function asArray(value: unknown, path: string): unknown[] {
  if (Array.isArray(value)) return value
  throw new Error(`crm-overview: ${path} is not an array`)
}

function reqNumber(value: unknown, path: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) throw new Error(`crm-overview: ${path} is not a number`)
  return parsed
}

function reqString(value: unknown, path: string): string {
  if (typeof value === 'string') return value
  throw new Error(`crm-overview: ${path} is not a string`)
}

function optString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A section is null when the plan excludes the module, and an error when it is absent altogether. */
function optionalSection<T>(root: Json, key: string, read: (section: Json) => T): T | null {
  if (!(key in root)) throw new Error(`crm-overview: ${key} is missing`)
  const value = root[key]
  if (value === null) return null
  return read(asRecord(value, key))
}

export function normalizeKpis(raw: unknown): KpiData {
  const root = asRecord(raw, 'kpis')
  return {
    clients: optionalSection(root, 'clients', (c) => ({
      total: reqNumber(c.total, 'clients.total'),
      atPreviousMonthEnd: reqNumber(c.at_previous_month_end, 'clients.at_previous_month_end'),
    })),
    leads: optionalSection(root, 'leads', (l) => ({
      open: reqNumber(l.open, 'leads.open'),
      createdThisMonth: reqNumber(l.created_this_month, 'leads.created_this_month'),
    })),
    quotes: optionalSection(root, 'quotes', (q) => ({
      active: reqNumber(q.active, 'quotes.active'),
      sent: reqNumber(q.sent, 'quotes.sent'),
    })),
    revenue: optionalSection(root, 'revenue', (r) => ({
      byCurrency: asArray(r.by_currency, 'revenue.by_currency').map((entry, index) => {
        const row = asRecord(entry, `revenue.by_currency[${index}]`)
        return {
          currency: reqString(row.currency, 'revenue.currency'),
          yearToDate: reqNumber(row.year_to_date, 'revenue.year_to_date'),
          previousYearToDate: reqNumber(row.previous_year_to_date, 'revenue.previous_year_to_date'),
          deals: reqNumber(row.deals, 'revenue.deals'),
        }
      }),
      wonWithoutDate: reqNumber(r.won_without_date, 'revenue.won_without_date'),
    })),
  }
}

function readMoney(value: unknown, path: string): Money[] {
  return asArray(value, path).map((entry, index) => {
    const row = asRecord(entry, `${path}[${index}]`)
    return { currency: reqString(row.currency, `${path}.currency`), amount: reqNumber(row.amount, `${path}.amount`) }
  })
}

function readPreviews(value: unknown, path: string): PipelinePreview[] {
  return asArray(value, path).map((entry, index) => {
    const row = asRecord(entry, `${path}[${index}]`)
    return {
      id: reqString(row.id, `${path}.id`),
      name: reqString(row.name, `${path}.name`),
      clientName: reqString(row.client_name, `${path}.client_name`),
      value: reqNumber(row.expected_value, `${path}.expected_value`),
      currency: reqString(row.currency, `${path}.currency`),
    }
  })
}

/** Null when the plan excludes the Sales module. */
export function normalizePipeline(raw: unknown): PipelineData | null {
  const root = asRecord(raw, 'pipeline')
  if (root.stages === null && root.won === null) return null

  const byStage = new Map<string, PipelineStage>()
  for (const [index, entry] of asArray(root.stages, 'pipeline.stages').entries()) {
    const row = asRecord(entry, `pipeline.stages[${index}]`)
    const stage = reqString(row.stage, 'pipeline.stage')
    byStage.set(stage, {
      stage: stage as PipelineStage['stage'],
      count: reqNumber(row.count, `${stage}.count`),
      totals: readMoney(row.totals, `${stage}.totals`),
      previews: readPreviews(row.previews, `${stage}.previews`),
    })
  }
  const stages = OPEN_STAGES.map((stage) => {
    const found = byStage.get(stage)
    if (!found) throw new Error(`crm-overview: pipeline stage ${stage} is missing`)
    return found
  })

  const wonRoot = asRecord(root.won, 'pipeline.won')
  const won: PipelineWon = {
    count: reqNumber(wonRoot.count, 'won.count'),
    totals: readMoney(wonRoot.totals, 'won.totals'),
    previews: readPreviews(wonRoot.previews, 'won.previews'),
  }
  return { stages, won }
}

function readBuckets(value: unknown, keyField: 'month' | 'week', path: string): BucketRow[] {
  return asArray(value, path).map((entry, index) => {
    const row = asRecord(entry, `${path}[${index}]`)
    return {
      key: keyField === 'week' ? String(reqNumber(row.week, `${path}.week`)) : reqString(row.month, `${path}.month`),
      currency: reqString(row.currency, `${path}.currency`),
      amount: reqNumber(row.amount, `${path}.amount`),
      deals: reqNumber(row.deals, `${path}.deals`),
    }
  })
}

/** Null when the plan excludes the Sales module. `current` is the reporting timezone's year and month. */
export function normalizeRevenue(raw: unknown, current: { year: number; month: number }): RevenueChartData | null {
  if (raw === null) return null
  const root = asRecord(raw, 'revenue')
  const notCharted = asRecord(root.pipeline_not_charted, 'revenue.pipeline_not_charted')
  return {
    currentYear: current.year,
    currentMonth: current.month,
    wonByMonth: readBuckets(root.won_by_month, 'month', 'won_by_month'),
    wonThisMonthByWeek: readBuckets(root.won_this_month_by_week, 'week', 'won_this_month_by_week'),
    pipelineByMonth: readBuckets(root.pipeline_by_month, 'month', 'pipeline_by_month'),
    pipelineThisMonthByWeek: readBuckets(root.pipeline_this_month_by_week, 'week', 'pipeline_this_month_by_week'),
    pipelineNotCharted: {
      noCloseDate: reqNumber(notCharted.no_close_date, 'no_close_date'),
      pastCloseDate: reqNumber(notCharted.past_close_date, 'past_close_date'),
      nextYearOrLater: reqNumber(notCharted.next_year_or_later, 'next_year_or_later'),
    },
  }
}

export function normalizeActivity(raw: unknown): ActivityEvent[] {
  return asArray(raw, 'activity').map((entry, index) => {
    const row = asRecord(entry, `activity[${index}]`)
    return {
      kind: reqString(row.kind, 'activity.kind'),
      recordId: reqString(row.record_id, 'activity.record_id'),
      title: reqString(row.title, 'activity.title'),
      subtitle: optString(row.subtitle),
      occurredAt: reqString(row.occurred_at, 'activity.occurred_at'),
    }
  })
}
