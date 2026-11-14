'use client'

import { Activity, Building2, CalendarPlus, ExternalLink, Layers, Link2, MapPin, Mountain, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import { linkMarketOrganizationAction } from '../actions'
import { STATUS_COLORS, STATUS_LABELS, operationCommodities, type MarketOperation, type MarketOrganization } from '../model'

const primary = 'inline-flex h-9 items-center justify-center gap-1.5 bg-brand px-3 text-xs font-semibold text-white outline-none hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const secondary = 'inline-flex h-9 items-center justify-center gap-1.5 border border-border px-3 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const disabledButton = 'inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 border border-border px-3 text-xs font-medium text-muted-foreground opacity-60'

/** The selected operation's organisation, its facts, HIMARK's relationship with it, and what to do next. */
export function OrganisationDetails({ organization, operation }: { organization: MarketOrganization | null; operation: MarketOperation | null }) {
  if (!organization || !operation) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <Mountain className="size-6 text-[var(--briefing-muted)]" aria-hidden="true" />
        <p className="max-w-60 text-sm text-[var(--briefing-muted)]">Select a mining operation on the map to see the organisation and HIMARK&apos;s relationship with it.</p>
      </div>
    )
  }
  const commodities = operationCommodities(operation)
  const viewHref = organization.clientId ? `/operations/clients/${organization.clientId}` : organization.leadId ? `/commercial/leads/${organization.leadId}` : null
  const scheduleHref = `/operations/calendar/new?${new URLSearchParams({
    title: `Engagement: ${organization.name}`,
    eventType: 'Client Meeting',
    description: `${operation.name} (${operation.province}). From HIMARK Mining Market Intelligence.`,
    ...(organization.clientId ? { clientId: organization.clientId } : {}),
  })}`

  return (
    <div className="flex h-full flex-col">
      {/* No verified photograph of the site is held, so a plain branded band stands in for one. */}
      <div className="relative flex h-20 items-center justify-center border-b border-border bg-muted">
        <Mountain className="size-7 text-[var(--briefing-muted)]" aria-hidden="true" />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1.5 border border-border bg-card px-2 py-0.5 text-[11px] font-medium">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: STATUS_COLORS[organization.status] }} />
          {STATUS_LABELS[organization.status]}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h3 className="text-base font-semibold leading-snug text-foreground">{organization.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--briefing-muted)]">{operation.name}</p>
        </div>

        <dl className="space-y-2 text-xs">
          <Fact icon={<MapPin className="size-3.5" />} label="Location">
            {operation.district ? `${operation.district}, ${operation.province}` : operation.province}
            {operation.locationAccuracy !== 'exact' ? <span className="text-[var(--briefing-muted)]"> ({operation.locationAccuracy === 'district' ? 'district only' : 'approximate'})</span> : null}
          </Fact>
          <Fact icon={<Layers className="size-3.5" />} label="Commodity">{commodities.length ? commodities.join(', ') : null}</Fact>
          <Fact icon={<Building2 className="size-3.5" />} label="Parent">{organization.parentName}</Fact>
          <Fact icon={<Activity className="size-3.5" />} label="Status">{[operation.operatingStatus, operation.operationType].filter(Boolean).join(' · ') || null}</Fact>
          <Fact icon={<Link2 className="size-3.5" />} label="Website">
            {organization.website ? (
              <a href={organization.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
                {organization.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                <ExternalLink className="size-3" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </Fact>
        </dl>

        <section className="border-t border-border pt-3" aria-labelledby="himark-relationship">
          <h4 id="himark-relationship" className="text-xs font-semibold text-foreground">HIMARK relationship</h4>
          <dl className="mt-2 grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-[var(--briefing-muted)]">Account owner</dt>
              <dd className="mt-0.5 font-medium">{organization.accountOwner ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--briefing-muted)]">Engagements</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{organization.engagements}</dd>
            </div>
            <div>
              <dt className="text-[var(--briefing-muted)]">Services</dt>
              <dd className="mt-0.5 font-medium">{organization.services ?? '—'}</dd>
            </div>
          </dl>
          <div className="mt-3 text-xs">
            <p className="text-[var(--briefing-muted)]">Opportunities</p>
            {organization.opportunities.length ? (
              <ul className="mt-1 space-y-1">
                {organization.opportunities.slice(0, 3).map((opportunity) => (
                  <li key={opportunity.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`/commercial/sales/${opportunity.id}`} className="truncate font-medium text-brand hover:underline">{opportunity.name}</Link>
                    <span className="shrink-0 text-[var(--briefing-muted)]">{opportunity.stage}</span>
                  </li>
                ))}
                {organization.opportunities.length > 3 ? <li className="text-[var(--briefing-muted)]">and {organization.opportunities.length - 3} more</li> : null}
              </ul>
            ) : (
              <p className="mt-0.5 font-medium">None recorded</p>
            )}
          </div>
        </section>

        {organization.match ? <MatchNotice organization={organization} /> : null}

        <div className="grid grid-cols-2 gap-2">
          {viewHref ? (
            <Link href={viewHref} className={`${primary} col-span-2`}>View company</Link>
          ) : (
            <span className={`${disabledButton} col-span-2`} title="Not in UNISON yet. Create a lead first." aria-disabled="true">View company (not in UNISON yet)</span>
          )}
          {organization.clientId || organization.leadId ? (
            <span className={disabledButton} title={organization.clientId ? 'Already a client in UNISON.' : 'Already a lead in UNISON.'} aria-disabled="true">
              <Plus className="size-3.5" aria-hidden="true" />Create lead
            </span>
          ) : (
            <Link href={`/commercial/leads/new?marketOrganization=${organization.id}`} className={secondary}>
              <Plus className="size-3.5" aria-hidden="true" />Create lead
            </Link>
          )}
          <Link href={scheduleHref} className={secondary}>
            <CalendarPlus className="size-3.5" aria-hidden="true" />Schedule engagement
          </Link>
        </div>

        {/* Only a status that says "Operating" is shown without a caveat: a listing in an older directory proves the site was registered, not that it works today. */}
        {operation.operatingStatus?.startsWith('Operating') ? null : (
          <p className="border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug">
            {operation.operatingStatus?.startsWith('Listed in DMPR')
              ? `${operation.operatingStatus}. This does not confirm the site operates today.`
              : 'Location on research map; current operating status unverified. This does not confirm the site operates today.'}
          </p>
        )}
        <p className="text-[11px] leading-snug text-[var(--briefing-muted)]">
          Source: {operation.source}{operation.verifiedOn ? `, verified ${operation.verifiedOn}` : ''}.
        </p>
      </div>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--briefing-muted)]" aria-hidden="true">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-[var(--briefing-muted)]">Not recorded</span>}</dd>
    </div>
  )
}

/** The organisation is already in UNISON under the same name: link it instead of creating a second record. */
function MatchNotice({ organization }: { organization: MarketOrganization }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const match = organization.match!
  return (
    <div className="border border-border bg-muted/40 p-3 text-xs">
      <p>
        UNISON has a {match.kind} named <span className="font-semibold">{match.name}</span>. Is it this organisation?
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await linkMarketOrganizationAction(organization.id, match.kind, match.id)
          if (result.error) setError(result.error)
          else router.refresh()
        })}
        className={`${secondary} mt-2 disabled:opacity-60`}
      >
        {pending ? 'Linking…' : `Link to this ${match.kind}`}
      </button>
      {error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}
    </div>
  )
}
