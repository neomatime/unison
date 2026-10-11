import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount } from '@/features/documents/document-view'
import { formatCurrency } from '@/lib/utils/format-money'
import {
  createFirstDocumentAction, createMonthlyInvoiceAction, endEngagementAction, endSupportAction,
} from '../actions/billing'
import type { PackageView } from '../billing-package-model'
import { getBillingPackage } from '../queries/get-billing-package'
import { AddSupportForm, ChangeTierForm, SetPackageForm, TopUpForm } from './billing-forms'

const money = (amount: number) => formatCurrency(amount, 'ZAR')
const TOP_UP_RATE = 'Extra credits are charged per credit at the rate card top-up rate. The invoice is built as a draft for you to review.'

function PackageCard({ pkg }: { pkg: PackageView }) {
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{pkg.name} <span className="font-normal text-[var(--briefing-muted)]">· {pkg.kind === 'retainer' ? 'Retainer' : 'Project'}</span></p>
          <p className="text-xs text-[var(--briefing-muted)]">
            Started {pkg.startDate}
            {pkg.fee !== null ? ` · ${money(pkg.fee)}${pkg.kind === 'retainer' ? ' a month' : ''} excluding VAT` : ''}
            {pkg.credits !== null ? ` · ${pkg.credits} credits included` : ''}
          </p>
          {pkg.kind === 'retainer' ? (
            <p className="text-xs text-[var(--briefing-muted)]">
              Active projects: {pkg.activeProjects}{pkg.initiativeLimit ? ` of ${pkg.initiativeLimit} allowed` : ' (no limit set for this tier)'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {pkg.canBuildFirst ? (
            <>
              <ActionButton action={createFirstDocumentAction.bind(null, pkg.id, 'invoice')} label="Create first invoice" ariaLabel={`Create first invoice: ${pkg.name}`} />
              <ActionButton action={createFirstDocumentAction.bind(null, pkg.id, 'quote')} label="Create first quote" ariaLabel={`Create first quote: ${pkg.name}`} />
            </>
          ) : null}
          <ActionButton action={endEngagementAction.bind(null, pkg.id)} label="End package" ariaLabel={`End package: ${pkg.name}`} confirmText="End this package? Any support services on it end too. Documents already built are not changed." tone="danger" />
        </div>
      </div>
      {pkg.firstBuilt ? <p className="text-xs text-[var(--briefing-muted)]">The first invoice has been built{pkg.kind === 'retainer' ? '; the implementation fee is billed once' : ''}.</p> : null}

      {pkg.kind === 'project' ? (
        <div className="space-y-2">
          {pkg.support.filter((s) => s.active).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{s.title} <span className="text-xs text-[var(--briefing-muted)]">· {money(s.price)} a month{s.credits !== null ? ` · ${s.credits} credits` : ''} · since {s.startDate}</span></span>
              <ActionButton action={endSupportAction.bind(null, s.id)} label="End service" ariaLabel={`End service: ${s.title}`} confirmText="End this support service?" tone="danger" />
            </div>
          ))}
          <AddSupportForm engagementId={pkg.id} services={pkg.availableSupport.map((s) => ({ key: s.key, label: `${s.title} (${money(s.price)} a month)` }))} />
        </div>
      ) : (
        <ChangeTierForm engagementId={pkg.id} tiers={pkg.otherTiers.map((t) => ({ key: t.key, label: `${t.name} (${money(t.fee)} a month)` }))} />
      )}
      <TopUpForm engagementId={pkg.id} rateLabel={TOP_UP_RATE} />
    </li>
  )
}

/** The client's package and the buttons that build its invoices from the rate card. Nothing here issues or sends anything. */
export async function BillingPackageSection({ clientId }: { clientId: string }) {
  const view = await getBillingPackage(clientId)
  if (!view) return null
  const hasRetainer = view.active.some((p) => p.kind === 'retainer')
  return (
    <WorkspaceSection
      title="Billing package"
      description="The client's retainer and projects. Invoices and quotes are built from the rate card as drafts for you to review and issue; prices come from the rate card and cannot be changed on them."
    >
      {view.active.length ? (
        <ul className="divide-y divide-border">
          {view.active.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No package recorded for this client yet.</p>
      )}

      {view.canBuildMonthly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-sm text-[var(--briefing-muted)]">The retainer&apos;s monthly fee (from the month after it started) and the support services running this month.</p>
          <ActionButton action={createMonthlyInvoiceAction.bind(null, clientId)} label="Create this month's invoice" />
        </div>
      ) : null}

      <SetPackageForm
        clientId={clientId}
        hasActiveRetainer={hasRetainer}
        retainers={view.packageOptions.retainers.map((o) => ({ key: o.key, label: `${o.name} (${money(o.fee)} a month${o.credits ? `, ${o.credits} credits` : ''})` }))}
        projects={view.packageOptions.projects.map((o) => ({ key: o.key, label: `${o.name} (${money(o.fee)}${o.credits ? `, ${o.credits} credits` : ''})` }))}
      />

      {view.documents.length ? (
        <div className="border-t border-border">
          <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Built from the package</p>
          <ul className="divide-y divide-border">
            {view.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/finance/invoices/${d.id}`} className="font-semibold text-brand hover:underline">{d.label}</Link>
                <span className="text-muted-foreground">{d.isDraft ? 'Draft' : d.number} · {d.status} · {d.currency} {formatAmount(d.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.past.length ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-[var(--briefing-muted)]">{view.past.length} earlier package{view.past.length === 1 ? '' : 's'}</summary>
          <ul className="divide-y divide-border">
            {view.past.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm text-[var(--briefing-muted)]">{p.name} · {p.kind === 'retainer' ? 'Retainer' : 'Project'} · {p.startDate} to {p.endedOn}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </WorkspaceSection>
  )
}
