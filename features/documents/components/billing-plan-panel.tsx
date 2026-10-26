import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { todayInJohannesburg } from '../../payments/fields'
import { approveFirstInvoiceAction, createPlanItemInvoiceAction } from '../actions/billing-plan'
import { BILLING_PLAN_COPY, blockerSentence, canCreateItemInvoice, describePlanItem, isAwaitingApproval, planStatusLine, planStatusTone, type PlanTone } from '../billing-plan-view'
import { agreementSentence } from '../billing-terms'
import { formatDocumentDate } from '../document-view'
import { getBillingPlan } from '../queries/get-billing-plan'
import { DOCUMENTS, isDraftReference } from '../vocabulary'
import { BillingPlanStateForm } from './billing-plan-state-form'

const BADGE_TONE: Record<PlanTone, 'info' | 'warning' | 'brand' | 'neutral'> = { waiting: 'info', attention: 'warning', done: 'brand', muted: 'neutral' }
const STATUS_TEXT = { brand: 'text-brand', warning: 'text-warning', neutral: 'text-muted-foreground' } as const

/**
 * The billing plan of an accepted quote: its state, what the client agreed to, one row per month with where its invoice stands, and
 * what a person can do next. Nothing is shown for a quote with no plan.
 *
 * The first invoice is approved here by an owner or admin, and only when nothing is missing: otherwise what is missing is listed
 * instead (read by the database from the same list the approval uses). Any member can make the draft of a month that is the first or
 * is due. Pausing, resuming and ending are for owners and admins, with a reason.
 */
export async function BillingPlanPanel({ quoteId }: { quoteId: string }) {
  const view = await getBillingPlan(quoteId)
  if (!view) return null
  const today = todayInJohannesburg()
  const firstItem = view.items.find((item) => item.kind === 'first')
  const awaitingApproval = firstItem ? isAwaitingApproval(firstItem, firstItem.invoice, view.plan.status) : false
  const agreement = agreementSentence({ monthly: null, termMonths: view.plan.termMonths, startDateLabel: formatDocumentDate(view.plan.startDate) })

  return (
    <WorkspaceSection
      title={BILLING_PLAN_COPY.title}
      description={BILLING_PLAN_COPY.description}
    >
      <div className="space-y-1 border-b border-border px-5 py-4 text-sm">
        <p className={`min-w-0 break-words font-medium ${STATUS_TEXT[planStatusTone(view.plan.status)]}`}>{planStatusLine(view.plan)}</p>
        {agreement ? <p className="text-foreground">{agreement}</p> : null}
      </div>

      {awaitingApproval && firstItem ? (
        <div className="space-y-3 border-b border-border px-5 py-4 text-sm">
          {view.blockers.length > 0 ? (
            <div>
              <h3 className="font-medium text-foreground">{BILLING_PLAN_COPY.blockersHeading}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {view.blockers.map((code) => (
                  <li key={code} className="break-words">{blockerSentence(code)}</li>
                ))}
              </ul>
            </div>
          ) : view.canManage ? (
            <ActionButton
              action={approveFirstInvoiceAction.bind(null, firstItem.id)}
              label={BILLING_PLAN_COPY.approveLabel}
              confirmText={BILLING_PLAN_COPY.approveConfirm}
            />
          ) : (
            <p className="text-muted-foreground">{BILLING_PLAN_COPY.approveAdminOnly}</p>
          )}
        </div>
      ) : null}

      {firstItem?.invoice?.status === 'Issued' && !view.emailed ? (
        <p className="border-b border-border px-5 py-3 text-sm text-warning">{BILLING_PLAN_COPY.approvedNotEmailed}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
              <th className="px-5 py-3 font-medium">Month</th>
              <th className="px-5 py-3 font-medium">Bill on</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.items.map((item) => {
              const described = describePlanItem(item, item.invoice, today)
              return (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-foreground">
                    {item.monthNumber}
                    {item.kind === 'first' ? <span className="ml-2 text-xs text-muted-foreground">First invoice</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDocumentDate(item.billOn) ?? item.billOn}</td>
                  <td className="px-5 py-3">
                    <StatusBadge tone={BADGE_TONE[described.tone]}>{described.label}</StatusBadge>
                  </td>
                  <td className="px-5 py-3">
                    {item.invoice ? (
                      <Link href={`${DOCUMENTS.invoice.base}/${item.invoice.id}`} className="font-semibold text-brand hover:underline">
                        {isDraftReference(item.invoice.number) ? 'Draft invoice' : item.invoice.number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">None yet</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {canCreateItemInvoice(item, item.invoice, view.plan.status, today) ? (
                      <ActionButton
                        action={createPlanItemInvoiceAction.bind(null, item.id)}
                        label={BILLING_PLAN_COPY.createLabel}
                        ariaLabel={`Create invoice for month ${item.monthNumber}`}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {view.canManage && view.plan.status !== 'ended' ? (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          {view.plan.status === 'active' ? <BillingPlanStateForm key="pause" planId={view.plan.id} action="pause" /> : null}
          {view.plan.status === 'paused' ? <BillingPlanStateForm key="resume" planId={view.plan.id} action="resume" /> : null}
          <BillingPlanStateForm key="end" planId={view.plan.id} action="end" />
        </div>
      ) : null}
    </WorkspaceSection>
  )
}
