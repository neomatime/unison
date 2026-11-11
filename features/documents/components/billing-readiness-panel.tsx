import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import type { PlanTone } from '../billing-plan-view'
import { describeReadiness } from '../billing-readiness-view'
import { getBillingReadiness } from '../queries/get-billing-readiness'
import { BillingReadinessOverrideForm } from './billing-readiness-override-form'

const BADGE_TONE: Record<PlanTone, 'info' | 'warning' | 'brand' | 'neutral'> = { waiting: 'info', attention: 'warning', done: 'brand', muted: 'neutral' }

/**
 * "Starting the work" on the quote page (accept to invoice, stage 4): whether the work may start (the start date has arrived and the
 * first invoice is paid), the link to the onboarding record made when the client accepted, and, for an owner or admin, the decision to
 * start anyway with a reason, or to take that decision back. Nothing is shown for a quote with no billing plan. The rule lives in the
 * database; this only shows its answer.
 */
export async function BillingReadinessPanel({ quoteId }: { quoteId: string }) {
  const view = await getBillingReadiness(quoteId)
  if (!view) return null
  const described = describeReadiness(view)
  if (!described) return null
  const canDecide = view.canManage && (view.state === 'waiting_start' || view.state === 'waiting_payment')
  const canRemove = view.canManage && view.state === 'overridden'

  return (
    <WorkspaceSection title="Starting the work" description="The work may start when the start date has arrived and the first invoice is paid. An owner or admin can decide otherwise, with a reason.">
      <div className="space-y-2 border-b border-border px-5 py-4 text-sm">
        <StatusBadge tone={BADGE_TONE[described.tone]} className="whitespace-normal">{described.line}</StatusBadge>
        {view.onboardingHref ? (
          <p>
            <Link href={view.onboardingHref} className="font-semibold text-brand hover:underline">Open the onboarding record</Link>
          </p>
        ) : null}
      </div>

      {view.canManage && (canDecide || canRemove) ? (
        <div className="px-5 py-4 text-sm">
          <BillingReadinessOverrideForm quoteId={quoteId} override={!canRemove} />
        </div>
      ) : null}
    </WorkspaceSection>
  )
}
