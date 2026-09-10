import { WorkPage } from '@/components/shared/work-page'
import { SupportTicketForm } from '@/features/collaboration/components/support-ticket-form'

export default function Page() {
  return <WorkPage category="Help & Support" title="Contact support" description="Send a support request to the UNISON product team." parent={{ label: 'Support', href: '/support' }} guidance={<><p className="font-semibold text-foreground">What to include</p><p className="mt-2">Describe where the issue occurred, the expected outcome and the actual result. Do not include passwords, payment card data or confidential credentials.</p></>}><SupportTicketForm /></WorkPage>
}
