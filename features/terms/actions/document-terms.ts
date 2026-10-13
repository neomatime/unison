'use server'

import { failureState } from '@/features/documents/action-failure'
import { revalidateDocumentPages } from '@/features/documents/revalidate'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { isDocumentKind } from '@/features/documents/vocabulary'
import { isUuid } from '@/lib/utils'
import { planFill } from '../document-terms'
import { getDocumentTermsState, resolveDocumentTerms } from '../queries/document-terms'
import { getDocument } from '@/features/documents/queries/get-document'

const OFFERING = /^(retainer|project|support)\.[a-z0-9_]{1,60}$/

/** Fills a draft's terms from the approved templates for the chosen offerings. `confirm` lets it replace typed terms. */
export async function fillDocumentTermsAction(kind: string, id: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(id)) return { error: 'That document was not found.' }
  const bundle = await getDocument(kind, id)
  if (!bundle) return { error: 'That document was not found.' }

  // A quote's offerings come from the picker; an invoice has no picker and uses the ones it already carries.
  const submitted = form.getAll('offering').map(String).filter((token) => OFFERING.test(token))
  const state = await getDocumentTermsState(kind, bundle.record, bundle.lines)
  const offerings = kind === 'quote' && form.has('offeringsShown') ? submitted : state.offerings

  const { resolved, offerings: used } = await resolveDocumentTerms(kind, offerings)
  const existing = String(bundle.record[kind === 'quote' ? 'terms' : 'payment_terms'] ?? '')
  const plan = planFill({ resolved, existingTerms: existing })
  if (!plan.ok) return { error: `These values are not available, so the terms were not filled: ${plan.missing.map((name) => `{{${name}}}`).join(', ')}. Check the rate card and company settings.` }
  if (resolved.sources.length === 0) return { error: 'There are no approved terms for these offerings yet. An owner or admin can approve them under Settings > Commercial terms.' }
  if (plan.needsConfirm && form.get('confirm') !== 'yes') {
    return { error: 'This document already has terms. Tick "Replace the terms I have typed" and fill again to replace them.' }
  }

  const { db } = await documentContext()
  const chosen = await db.rpc('set_document_offerings', {
    p_kind: kind, p_document: id, p_offerings: used.map((token) => { const [offeringKind, ...rest] = token.split('.'); return { kind: offeringKind, key: rest.join('.') } }),
  })
  if (chosen.error) return failureState(chosen.error)
  const saved = await db.rpc('set_document_terms', {
    p_kind: kind, p_document: id, p_terms: plan.terms, p_inclusions: plan.inclusions, p_sources: plan.sources, p_edited: false,
  })
  if (saved.error) return failureState(saved.error)
  revalidateDocumentPages()
  return { success: `Terms filled from ${plan.sources.length} template${plan.sources.length === 1 ? '' : 's'}.` }
}

