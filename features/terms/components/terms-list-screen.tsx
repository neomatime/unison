import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatDocumentDate } from '@/features/documents/document-view'
import { documentContext } from '@/features/documents/server-context'
import { groupTemplates, templateStatus } from '../grouping'
import { listTermsTemplates } from '../queries/list-terms-templates'
import { NewTemplateForm } from './new-template-form'

const APPLIES: Record<string, string> = { quote: 'Quotes', invoice: 'Invoices', both: 'Quotes and invoices' }
const badge = 'mr-2 mt-1.5 inline-block border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide'

export async function TermsListScreen() {
  const [{ role }, templates] = await Promise.all([documentContext(), listTermsTemplates()])
  const canManage = role === 'owner' || role === 'admin'
  const groups = groupTemplates(templates)
  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Organisation Profile', href: '/settings' }}
        title="Commercial terms"
        description="The standard terms and conditions for each offering. Only approved terms whose effective date has arrived are used, and an approved version never changes: write a new version instead."
      />
      <p className="mb-4 text-sm text-[var(--briefing-muted)]">
        {canManage ? 'Owners and admins write, approve and archive terms.' : 'You can read approved terms. Only an owner or admin can change them.'}
      </p>
      <div className="space-y-5">
        {groups.map((group) => (
          <WorkspaceSection key={group.label} title={group.label}>
            <ul className="divide-y divide-border">
              {group.rows.map((template) => {
                const status = templateStatus(template)
                return (
                  <li key={template.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{template.title}</p>
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {APPLIES[template.appliesTo]}
                        {status.kind === 'current' ? ` · Approved version ${status.version}, effective ${formatDocumentDate(status.effectiveFrom)}` : null}
                        {status.kind === 'upcoming' ? ` · Approved version ${status.version}, effective ${formatDocumentDate(status.effectiveFrom)} (not yet in force)` : null}
                      </p>
                      {status.kind === 'none' ? <span className={`${badge} border-amber-300 text-amber-800`}>No approved terms</span> : null}
                      {template.hasDraft ? <span className={`${badge} border-border text-[var(--briefing-muted)]`}>Draft pending</span> : null}
                    </div>
                    <Link href={`/settings/terms/${template.id}`} aria-label={`${canManage ? 'Open' : 'View'}: ${template.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                      {canManage ? 'Open' : 'View'}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </WorkspaceSection>
        ))}
        {groups.length === 0 ? <p className="text-sm text-[var(--briefing-muted)]">There are no terms templates yet.</p> : null}
        {canManage ? <NewTemplateForm /> : null}
      </div>
    </>
  )
}
