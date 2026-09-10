import { ApprovalDetail } from '@/features/delivery/components/approval-workspace'
import { getApproval } from '@/features/delivery/queries/approvals'
import { notFound } from 'next/navigation'
export default async function Page({params}:{params:Promise<{approvalId:string}>}){const {approvalId}=await params;const approval=await getApproval(approvalId);if(!approval)notFound();return <ApprovalDetail approval={approval}/>}
