import { notFound } from 'next/navigation'
import { ApprovalDecisionPage, type ApprovalAction } from '@/features/delivery/components/approval-decision-page'

const actions: ApprovalAction[] = ['approve', 'changes', 'reject', 'reassign', 'delegate', 'withdraw']

export default async function Page({ params, searchParams }: { params: Promise<{ approvalId: string }>; searchParams: Promise<{ action?: string }> }) {
  const [{ approvalId }, query] = await Promise.all([params, searchParams])
  if (!actions.includes(query.action as ApprovalAction)) notFound()
  return <ApprovalDecisionPage approvalId={approvalId} action={query.action as ApprovalAction} />
}
