import { Building2, CreditCard, Database, Plus, TicketCheck } from 'lucide-react'
import Link from 'next/link'

import { listPlatformOrganizations, listPlatformSubscriptions, listSupportCases, listTenantConfigurations } from '@/features/platform-admin/queries'

import { InternalEmptyState, InternalMetric, InternalPageHeader, ProvisioningStatusBadge } from './internal-primitives'

const OPEN_CASE_STATUSES = ['Open', 'Investigating', 'Waiting on Customer']

// Every figure is counted from the database; nothing here is a literal.
export async function InternalOverview() {
  const [organisations, tenants, subscriptions, cases] = await Promise.all([
    listPlatformOrganizations(),
    listTenantConfigurations(),
    listPlatformSubscriptions(),
    listSupportCases(),
  ])
  const activeOrganisations = organisations.filter((item) => item.status === 'active').length
  const configuredTenants = tenants.filter((item) => item.configuration).length
  const activeSubscriptions = subscriptions.filter((item: { status: string }) => item.status === 'active').length
  const openCases = cases.filter((item: { status: string }) => OPEN_CASE_STATUSES.includes(item.status)).length

  return <>
    <InternalPageHeader
      title="HIMARK Internal Overview"
      description="Organisations, tenants, subscriptions and support across the UNISON platform."
      actions={<Link href="/internal/provisioning/new" className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-primary-foreground hover:bg-brand/90"><Plus className="size-4" />New provisioning</Link>}
    />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InternalMetric label="Organisations" value={String(organisations.length)} detail={`${activeOrganisations} active`} icon={Building2} />
      <InternalMetric label="Tenants" value={String(configuredTenants)} detail={`of ${organisations.length} configured`} icon={Database} />
      <InternalMetric label="Subscriptions" value={String(subscriptions.length)} detail={`${activeSubscriptions} active`} icon={CreditCard} />
      <InternalMetric label="Open support cases" value={String(openCases)} detail={`${cases.length} in total`} icon={TicketCheck} tone={openCases > 0 ? 'warning' : 'success'} />
    </section>
    <section className="mt-5 border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border p-5">
        <h2 className="font-brand text-sm font-medium tracking-[0.08em] uppercase">Recent organisations</h2>
        <Link href="/internal/organisations" className="text-xs font-semibold text-brand">View all</Link>
      </header>
      {organisations.length === 0 ? (
        <InternalEmptyState title="No organisations yet" description="Provisioned organisations appear here." />
      ) : (
        <div className="divide-y divide-border">
          {organisations.slice(0, 6).map((organisation) => (
            <Link key={organisation.id} href={`/internal/tenants/${organisation.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/50">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{organisation.name}</span><span className="block truncate text-xs text-muted-foreground">{organisation.slug}</span></span>
              <ProvisioningStatusBadge status={organisation.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  </>
}
