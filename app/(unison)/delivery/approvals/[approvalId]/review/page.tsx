import { notFound } from 'next/navigation'
import { ApprovalDecisionPage, type ApprovalAction } from '@/features/delivery/components/approval-decision-page'
import { getApproval } from '@/features/delivery/queries/approvals'

const actions: ApprovalAction[] = ['approve', 'changes', 'reject', 'withdraw']

export default async function Page({ params, searchParams }: { params: Promise<{ approvalId: string }>; searchParams: Promise<{ action?: string }> }) {
  const [{ approvalId }, query] = await Promise.all([params, searchParams])
  if (!actions.includes(query.action as ApprovalAction)) notFound()
  const approval = await getApproval(approvalId)
  if (!approval) notFound()
  return <ApprovalDecisionPage approval={approval} action={query.action as ApprovalAction} />
}
