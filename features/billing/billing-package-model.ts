// The view model of a client's Billing package section. Pure: no imports of server code. Prices, credits and limits come from
// the rate card rows in the database (an owner or admin may change them), never from the code data file.
import { packageName } from './rate-card.ts'

export type RateRow = {
  rate_key: string
  item_kind: string
  package_key: string | null
  title: string
  unit_price: number | string
  credits: number | string | null
  initiative_limit: number | null
  rate_status: string
}
export type EngagementRow = { id: string; kind: 'retainer' | 'project'; package_key: string; start_date: string; ended_on: string | null; replaces_id: string | null; root_id: string }
export type SupportRow = { id: string; engagement_id: string; service_key: string; start_date: string; ended_on: string | null }
export type BillingDocumentRow = {
  id: string; invoice_number: string; status: string; billing_kind: 'first' | 'monthly' | 'top_up'; billing_month: string | null
  total_amount: number | string; currency: string; created_at: string
}
export type BillingPackageInput = {
  engagements: EngagementRow[]
  support: SupportRow[]
  rateRows: RateRow[]
  firstInvoiceEngagementIds: string[]
  documents: BillingDocumentRow[]
}

export type SupportView = { id: string; key: string; title: string; price: number; credits: number | null; startDate: string; endedOn: string | null; active: boolean }
export type PackageView = {
  id: string
  kind: 'retainer' | 'project'
  packageKey: string
  name: string
  startDate: string
  endedOn: string | null
  active: boolean
  fee: number | null
  credits: number | null
  /** Built and not cancelled: true for the whole chain of a replaced retainer. */
  firstBuilt: boolean
  /** An active package whose chain has no first invoice yet. A retainer that replaced another can build it too: the invoice is stored against the chain's root. */
  canBuildFirst: boolean
  /** Retainer only: how many active projects the tier allows (null = no limit) and how many the client has. */
  initiativeLimit: number | null
  activeProjects: number
  otherTiers: { key: string; name: string; fee: number }[]
  support: SupportView[]
  availableSupport: { key: string; title: string; price: number; credits: number | null }[]
}
export type PackageOption = { key: string; name: string; fee: number; credits: number | null }
export type BillingDocumentView = { id: string; number: string; isDraft: boolean; status: string; label: string; total: number; currency: string }
export type BillingPackageView = {
  active: PackageView[]
  past: PackageView[]
  packageOptions: { retainers: PackageOption[]; projects: PackageOption[] }
  canBuildMonthly: boolean
  documents: BillingDocumentView[]
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const num = (raw: number | string | null): number | null => (raw === null || raw === undefined ? null : Number(raw))

function documentLabel(row: BillingDocumentRow): string {
  if (row.billing_kind === 'first') return 'First invoice'
  if (row.billing_kind === 'top_up') return 'Top-up invoice'
  return row.billing_month ? `Monthly invoice, ${MONTH.format(new Date(`${row.billing_month}T00:00:00Z`))}` : 'Monthly invoice'
}

export function buildBillingPackageView(input: BillingPackageInput): BillingPackageView {
  const monthlyRows = input.rateRows.filter((row) => row.item_kind === 'retainer_monthly')
  const projectRows = input.rateRows.filter((row) => row.item_kind === 'project')
  const supportRows = input.rateRows.filter((row) => row.item_kind === 'support')
  const firstBuilt = new Set(input.firstInvoiceEngagementIds)
  const activeProjects = input.engagements.filter((e) => e.kind === 'project' && e.ended_on === null).length

  const toOption = (row: RateRow): PackageOption => ({ key: String(row.package_key), name: packageName(String(row.package_key)), fee: Number(row.unit_price), credits: num(row.credits) })
  const packageOptions = { retainers: monthlyRows.map(toOption), projects: projectRows.map(toOption) }

  const views: PackageView[] = input.engagements.map((e) => {
    const active = e.ended_on === null
    const row = (e.kind === 'retainer' ? monthlyRows : projectRows).find((r) => r.package_key === e.package_key)
    const support = input.support
      .filter((s) => s.engagement_id === e.id)
      .map((s): SupportView => {
        const item = supportRows.find((r) => r.rate_key === s.service_key)
        return { id: s.id, key: s.service_key, title: item?.title ?? s.service_key, price: Number(item?.unit_price ?? 0), credits: num(item?.credits ?? null), startDate: s.start_date, endedOn: s.ended_on, active: s.ended_on === null }
      })
    const runningKeys = new Set(support.filter((s) => s.active).map((s) => s.key))
    const built = firstBuilt.has(e.root_id)
    return {
      id: e.id,
      kind: e.kind,
      packageKey: e.package_key,
      name: packageName(e.package_key),
      startDate: e.start_date,
      endedOn: e.ended_on,
      active,
      fee: row ? Number(row.unit_price) : null,
      credits: row ? num(row.credits) : null,
      firstBuilt: built,
      canBuildFirst: active && !built,
      initiativeLimit: e.kind === 'retainer' ? (row?.initiative_limit ?? null) : null,
      activeProjects: e.kind === 'retainer' ? activeProjects : 0,
      otherTiers: e.kind === 'retainer' ? packageOptions.retainers.filter((o) => o.key !== e.package_key).map((o) => ({ key: o.key, name: o.name, fee: o.fee })) : [],
      support,
      availableSupport: e.kind === 'project' && active
        ? supportRows.filter((r) => r.package_key === e.package_key && !runningKeys.has(r.rate_key)).map((r) => ({ key: r.rate_key, title: r.title, price: Number(r.unit_price), credits: num(r.credits) }))
        : [],
    }
  })

  const active = views.filter((v) => v.active)
  const documents = [...input.documents]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((d): BillingDocumentView => ({
      id: d.id, number: d.invoice_number, isDraft: d.status === 'Draft', status: d.status, label: documentLabel(d), total: Number(d.total_amount), currency: d.currency,
    }))
  return {
    active,
    past: views.filter((v) => !v.active),
    packageOptions,
    canBuildMonthly: active.some((v) => v.kind === 'retainer') || active.some((v) => v.support.some((s) => s.active)),
    documents,
  }
}
