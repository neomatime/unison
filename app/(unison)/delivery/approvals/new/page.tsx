import { ApprovalForm } from '@/features/delivery/components/approval-workspace'
import { listApprovalProjects } from '@/features/delivery/queries/approvals'
export default async function Page(){return <ApprovalForm projects={await listApprovalProjects()}/>}
