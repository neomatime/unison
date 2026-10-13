import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '@/features/documents/queries/get-document'
import { isDraftStatus, type DocumentKind } from '@/features/documents/vocabulary'
import { sourceSummary } from '../document-terms'
import { getDocumentTermsState } from '../queries/document-terms'
import { documentContext } from '@/features/documents/server-context'
import { FillTermsForm } from './fill-terms-form'

/** The template versions the accepted quote was filled from (the invoice keeps its own sources for its payment terms). */
async function acceptedQuoteSources(quoteId: string) {
  const { organization, db } = await documentContext()
  const found = await db.from('quotes').select('terms_sources').eq('id', quoteId).eq('organization_id', organization.id).maybeSingle()
  if (found.error) throw found.error
  return (Array.isArray(found.data?.terms_sources) ? found.data.terms_sources : []) as Array<{ templateId: string; version: number }>
}

/** Where a quote or invoice gets its terms from: the approved templates, filled for what is being sold. */
export async function DocumentTermsPanel({ kind, id }: { kind: DocumentKind; id: string }) {
  const bundle = await getDocument(kind, id)
  if (!bundle) return null
  const { record } = bundle
  const draft = isDraftStatus(kind, record.status)
  const sources = (Array.isArray(record.terms_sources) ? record.terms_sources : []) as Array<{ templateId: string; version: number }>
  const state = await getDocumentTermsState(kind, record)
  const used = sourceSummary(sources, state.titles)
  const typed = String(record[kind === 'quote' ? 'terms' : 'payment_terms'] ?? '').trim() !== ''
  const accepted = kind === 'invoice' && record.quote_id ? sourceSummary(await acceptedQuoteSources(String(record.quote_id)), state.titles) : null

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
