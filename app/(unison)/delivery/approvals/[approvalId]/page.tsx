import { ApprovalDetail } from '@/features/delivery/components/approval-workspace'
export default async function Page({params}:{params:Promise<{approvalId:string}>}){const {approvalId}=await params;return <ApprovalDetail approvalId={approvalId}/>}
