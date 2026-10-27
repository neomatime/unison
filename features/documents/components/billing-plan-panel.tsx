import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { todayInJohannesburg } from '../../payments/fields'
import { createPlanItemInvoiceAction } from '../actions/billing-plan'
import { BILLING_PLAN_COPY, billingPlanDescription, blockerSentence, canCreateItemInvoice, describePlanItem, isAwaitingApproval, planStatusLine, planStatusTone, type PlanTone } from '../billing-plan-view'
import { agreementSentence } from '../billing-terms'
import { formatDocumentDate } from '../document-view'
import { getBillingPlan } from '../queries/get-billing-plan'
import { DOCUMENTS, isDraftReference } from '../vocabulary'
import { ApproveFirstInvoiceControl } from './approve-first-invoice-control'
import { BillingPlanStateForm } from './billing-plan-state-form'

const BADGE_TONE: Record<PlanTone, 'info' | 'warning' | 'brand' | 'neutral'> = { waiting: 'info', attention: 'warning', done: 'brand', muted: 'neutral' }
const STATUS_TEXT = { brand: 'text-brand', warning: 'text-warning', neutral: 'text-muted-foreground' } as const

/**
 * The billing plan of an accepted quote: its state, what the client agreed to, one row per month with where its invoice stands, and
 * what a person can do next. Nothing is shown for a quote with no plan.
 *
 * The first invoice is approved here by an owner or admin, and only when nothing is missing: otherwise what is missing is listed
 * instead (read by the database from the same list the approval uses). The approve control is mounted in one fixed place for an owner
 * or admin as soon as the first invoice exists, not only while it awaits approval: it shows what the approval and the email came to,
 * and the refresh that follows an approval must not take that message away with the button. Any member can make the draft of a month
 * that is the first or is due, a monthly one only once the first invoice has been approved. Pausing, resuming and ending are for owners
 * and admins, with a reason.
 */
export async function BillingPlanPanel({ quoteId }: { quoteId: string }) {
  const view = await getBillingPlan(quoteId)
  if (!view) return null
  const today = todayInJohannesburg()
  const firstItem = view.items.find((item) => item.kind === 'first')
  const awaitingApproval = firstItem ? isAwaitingApproval(firstItem, firstItem.invoice, view.plan.status) : false
  // No month is prompted, or offered Create invoice, until the first invoice has been approved by a person.
  const firstApproved = firstItem !== undefined && firstItem.approvedAt !== null
  const agreement = agreementSentence({ monthly: null, termMonths: view.plan.termMonths, startDateLabel: formatDocumentDate(view.plan.startDate) })

  return (
    <WorkspaceSection
      title={BILLING_PLAN_COPY.title}
      description={billingPlanDescription(view.items)}
    >
      <div className="space-y-1 border-b border-border px-5 py-4 text-sm">
        <p className={`min-w-0 break-words font-medium ${STATUS_TEXT[planStatusTone(view.plan.status)]}`}>{planStatusLine(view.plan)}</p>
        {agreement ? <p className="text-foreground">{agreement}</p> : null}
      </div>

      {awaitingApproval && firstItem && view.blockers.length > 0 ? (
        <div className="border-b border-border px-5 py-4 text-sm">
          <h3 className="font-medium text-foreground">{BILLING_PLAN_COPY.blockersHeading}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {view.blockers.map((code) => (
              <li key={code} className="break-words">{blockerSentence(code)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {awaitingApproval && firstItem && view.blockers.length === 0 && !view.canManage ? (
        <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">{BILLING_PLAN_COPY.approveAdminOnly}</p>
      ) : null}

      {firstItem?.invoice && view.canManage ? (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 text-sm empty:hidden">
          <ApproveFirstInvoiceControl itemId={firstItem.id} canApprove={awaitingApproval && view.blockers.length === 0} />
        </div>
      ) : null}

      {firstItem?.invoice?.status === 'Issued' && !view.emailed ? (
        <p className="border-b border-border px-5 py-3 text-sm text-warning">{BILLING_PLAN_COPY.approvedNotEmailed}</p>
      ) : null}

      {/*
        One markup, two layouts. From md up it is the table: five columns, scrolling sideways inside its card if it must. Below md the table
        elements are blocks and each month is a stacked block: "Month N" and the date on the first line, the status on a line of its own, the
        invoice link and the Create invoice button on the last. The sidebar only starts at lg, so between sm and md the content is 592 to
        720 px wide, less than the table needs; that is why the switch is md. The wrapper is `relative` so that the screen-reader-only
        "Actions" label (position: absolute) stays inside the scroll box instead of landing at the table's full width and widening the page.
        Table cells are not flex items while the row is a table row, so basis-full and ml-auto do nothing from md, and the cells' padding
        is the md: one; the row pads on a phone.
      */}
      <div className="relative overflow-x-auto">
        <table className="block w-full text-left text-sm md:table">
          <thead className="hidden md:table-header-group">
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
          <tbody className="block divide-y divide-border md:table-row-group">
            {view.items.map((item) => {
              const described = describePlanItem(item, item.invoice, today, view.plan.status, firstApproved)
              return (
                <tr key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 md:table-row">
                  <td className="text-foreground md:px-5 md:py-3">
                    <span className="md:hidden">Month </span>{item.monthNumber}
                    {item.kind === 'first' ? <span className="ml-2 text-xs text-muted-foreground">First invoice</span> : null}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground md:px-5 md:py-3">{formatDocumentDate(item.billOn) ?? item.billOn}</td>
                  <td className="basis-full md:px-5 md:py-3">
                    <StatusBadge tone={BADGE_TONE[described.tone]} className="whitespace-normal md:whitespace-nowrap">{described.label}</StatusBadge>
                  </td>
                  <td className="md:px-5 md:py-3">
                    {item.invoice ? (
                      <Link href={`${DOCUMENTS.invoice.base}/${item.invoice.id}`} className="font-semibold text-brand hover:underline">
                        {isDraftReference(item.invoice.number) ? 'Draft invoice' : item.invoice.number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">None yet</span>
                    )}
                  </td>
                  <td className="ml-auto md:px-5 md:py-3 md:text-right">
                    {canCreateItemInvoice(item, item.invoice, view.plan.status, today, firstApproved) ? (
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
