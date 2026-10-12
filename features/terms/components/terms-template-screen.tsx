import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatDocumentDate } from '@/features/documents/document-view'
import { documentContext } from '@/features/documents/server-context'
import { archiveTermsVersionAction, discardTermsDraftAction, restoreTermsVersionAction } from '../actions/terms'
import { getTermsTemplate } from '../queries/get-terms-template'
import { DraftEditor } from './draft-editor'
import { TermsPreview } from './terms-preview'

const APPLIES: Record<string, string> = { quote: 'quotes', invoice: 'invoices', both: 'quotes and invoices' }
const KIND: Record<string, string> = { company: 'Company-wide terms', retainer: 'Retainer tier', project: 'Project category', support: 'Support service' }
const STATUS: Record<string, string> = { draft: 'Draft', approved: 'Approved', archived: 'Archived' }

/** The time a draft was last saved, in South African time. */
const savedTime = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' })

/** A timestamp as the South African calendar date (YYYY-MM-DD), so a late-evening UTC time does not show the previous day. */
const savedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' })
const dayOf = (timestamp: string) => savedDay.format(new Date(timestamp))

export async function TermsTemplateScreen({ templateId, versionId }: { templateId: string; versionId?: string }) {
  const [{ role }, detail] = await Promise.all([documentContext(), getTermsTemplate(templateId, versionId)])
  if (!detail) notFound()
  const canManage = role === 'owner' || role === 'admin'
  const { template, versions, current, draft, selected, preview, names } = detail
  const who = (id: string | null) => (id ? names[id] ?? 'A team member' : '—')
  // A new draft starts from the draft if there is one, otherwise from the version in force, otherwise from the newest version.
  const startFrom = draft ?? current ?? versions[0] ?? null
  const savedAt = draft ? savedTime.format(new Date(draft.updatedAt)) : null

  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Commercial terms', href: '/settings/terms' }}
        title={template.title}
        description={`${KIND[template.targetKind]}${template.targetKey ? ` (${template.targetKey})` : ''}, for ${APPLIES[template.appliesTo]}.`}
      />
      <div className="space-y-5">
        <WorkspaceSection title="Versions" description="An approved version cannot be edited. To change the wording, write a new version.">
          {versions.length ? (
            <ul className="divide-y divide-border">
              {versions.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">
                      Version {item.version} · {STATUS[item.status]}
                      {current?.id === item.id ? <span className="ml-2 border border-success/40 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success">In force</span> : null}
                      {selected?.id === item.id ? <span className="ml-2 border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Previewed</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                      {item.effectiveFrom ? `Effective ${formatDocumentDate(item.effectiveFrom)}` : 'No effective date yet'}
                      {` · Written by ${who(item.createdBy)} on ${formatDocumentDate(dayOf(item.createdAt))}`}
                      {item.approvedAt ? ` · Approved by ${who(item.approvedBy)} on ${formatDocumentDate(dayOf(item.approvedAt))}` : ''}
                      {item.archivedAt ? ` · Archived ${formatDocumentDate(dayOf(item.archivedAt))}` : ''}
                    </p>
                    {item.changeNote ? <p className="mt-1 break-words text-xs text-[var(--briefing-muted)]">{item.changeNote}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/settings/terms/${template.id}?version=${item.id}`} aria-label={`Preview version ${item.version}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">Preview</Link>
                    {canManage && item.status !== 'draft' ? (
                      <ActionButton action={restoreTermsVersionAction.bind(null, item.id)} label="Restore" ariaLabel={`Restore version ${item.version} into a new draft`} confirmText="Copy this version into a new draft? The version itself is not changed." />
                    ) : null}
                    {canManage && item.status === 'approved' ? (
                      <ActionButton action={archiveTermsVersionAction.bind(null, item.id)} label="Archive" ariaLabel={`Archive version ${item.version}`} tone="danger" confirmText="Archive this version? It stops being used for new documents. Documents that already used it are not changed." />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No version has been written yet.</p>
          )}
        </WorkspaceSection>

        {canManage ? (
          <WorkspaceSection
            title={draft ? 'Draft' : 'Write a new version'}
            action={draft ? <ActionButton action={discardTermsDraftAction.bind(null, template.id)} label="Discard draft" ariaLabel="Discard the draft" tone="danger" confirmText="Discard this draft? The text is deleted." /> : undefined}
          >
            <DraftEditor
              key={template.id}
              templateId={template.id}
              hasDraft={Boolean(draft)}
              savedAt={savedAt}
              start={{
                body: startFrom?.body ?? '', inclusions: startFrom?.inclusions ?? '',
                effectiveFrom: draft?.effectiveFrom ?? null, changeNote: draft?.changeNote ?? null,
              }}
            />
          </WorkspaceSection>
        ) : null}

        <WorkspaceSection title="Preview" description="As a client would read it, with today's rate card values and company settings.">
          {preview && selected ? (
            <TermsPreview preview={preview} label={`Version ${selected.version} (${STATUS[selected.status].toLowerCase()})${template.targetKind === 'company' ? '' : ', after the current company terms'}.`} />
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">Nothing to preview yet.</p>
          )}
        </WorkspaceSection>
      </div>
    </>
  )
}
