import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '@/features/documents/queries/get-document'
import { isDraftStatus, type DocumentKind } from '@/features/documents/vocabulary'
import { sourceSummary } from '../document-terms'
import { getDocumentTermsState } from '../queries/document-terms'
import { FillTermsForm } from './fill-terms-form'

/** Where a quote or invoice gets its terms from: the approved templates, filled for what is being sold. */
export async function DocumentTermsPanel({ kind, id }: { kind: DocumentKind; id: string }) {
  const bundle = await getDocument(kind, id)
  if (!bundle) return null
  const { record } = bundle
  const draft = isDraftStatus(kind, record.status)
  const sources = (Array.isArray(record.terms_sources) ? record.terms_sources : []) as Array<{ template_id: string; version: number }>
  const state = await getDocumentTermsState(kind, record, bundle.lines)
  const used = sourceSummary(sources, state.titles)
  const typed = String(record[kind === 'quote' ? 'terms' : 'payment_terms'] ?? '').trim() !== ''
  const quoteSources = (Array.isArray(record.quote_terms_sources) ? record.quote_terms_sources : []) as Array<{ template_id: string; version: number }>
  const accepted = kind === 'invoice' ? sourceSummary(quoteSources, state.titles) : null

  if (!draft && !used && !accepted) return null
  return (
    <WorkspaceSection
      title="Terms"
      description={draft ? 'Fill the terms from the approved templates for what is being sold. You can still edit the text afterwards.' : 'The wording this document went out with. It does not change when a template does.'}
    >
      <div className="space-y-1 border-b border-border px-5 py-3 text-sm">
        {used ? <p>Filled from: {used}{record.terms_edited ? ' — edited from template' : ''}</p> : <p className="text-[var(--briefing-muted)]">Not filled from a template.</p>}
        {accepted ? <p className="text-[var(--briefing-muted)]">The quote the client accepted used: {accepted}</p> : null}
      </div>
      {draft ? <FillTermsForm kind={kind} id={id} options={state.options} selected={state.offerings} hasTypedTerms={typed && (!used || Boolean(record.terms_edited))} /> : null}
    </WorkspaceSection>
  )
}
