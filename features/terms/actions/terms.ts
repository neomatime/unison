'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { failureState } from '@/features/documents/action-failure'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { isValidIsoDate } from '@/features/delivery/schemas/date'
import { isUuid } from '@/lib/utils'

const NOT_FOUND = 'That terms template was not found.'

function revalidateTerms() {
  revalidatePath('/settings/terms')
  revalidatePath('/(unison)/settings/terms/[templateId]', 'page')
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '')

export async function createTermsTemplateAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const kind = text(form, 'targetKind').trim()
  if (!['retainer', 'project', 'support'].includes(kind)) return { error: 'Choose what the template is for.' }
  const appliesTo = text(form, 'appliesTo').trim()
  if (!['quote', 'invoice', 'both'].includes(appliesTo)) return { error: 'Choose whether it is for quotes, invoices or both.' }
  const { organization, db } = await documentContext()
  const created = await db.rpc('create_terms_template', {
    p_org: organization.id, p_target_kind: kind, p_target_key: text(form, 'targetKey').trim(), p_applies_to: appliesTo, p_title: text(form, 'title'),
  })
  if (created.error || typeof created.data !== 'string') return failureState(created.error, 'The template could not be created. Please try again.')
  revalidateTerms()
  redirect(`/settings/terms/${created.data}`)
}

/** Saves the draft; with intent "approve" it then approves the version it just saved. */
export async function saveTermsDraftAction(templateId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(templateId)) return { error: NOT_FOUND }
  const effective = text(form, 'effectiveFrom').trim()
  if (effective !== '' && !isValidIsoDate(effective)) return { error: 'Enter a valid effective date.' }
  const { db } = await documentContext()
  const saved = await db.rpc('save_terms_draft', {
    p_template: templateId,
    p_body: text(form, 'body'),
    p_inclusions: text(form, 'inclusions'),
    p_effective_from: effective === '' ? null : effective,
    p_change_note: text(form, 'changeNote'),
  })
  if (saved.error || typeof saved.data !== 'string') return failureState(saved.error, 'The draft could not be saved. Please try again.')
  if (text(form, 'intent') === 'approve') {
    const approved = await db.rpc('approve_terms_version', { p_version: saved.data })
    // The draft is saved even when approval is refused: say so, so nothing typed is lost.
    if (approved.error) {
      revalidateTerms()
      const message = failureState(approved.error, 'The terms could not be approved. Please try again.')?.error
      return { error: `Your draft was saved, but it was not approved. ${message}` }
    }
    revalidateTerms()
    return { success: 'Approved. This version is now fixed and cannot be edited.' }
  }
  revalidateTerms()
  return { success: 'Draft saved.' }
}

export async function discardTermsDraftAction(templateId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(templateId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('discard_terms_draft', { p_template: templateId })
  if (result.error) return failureState(result.error, 'The draft could not be discarded. Please try again.')
  revalidateTerms()
  return { success: 'Draft discarded.' }
}

export async function archiveTermsVersionAction(versionId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(versionId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('archive_terms_version', { p_version: versionId })
  if (result.error) return failureState(result.error, 'The version could not be archived. Please try again.')
  revalidateTerms()
  return { success: 'Archived.' }
}

export async function restoreTermsVersionAction(versionId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(versionId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('restore_terms_version', { p_version: versionId })
  if (result.error) return failureState(result.error, 'The version could not be restored. Please try again.')
  revalidateTerms()
  return { success: 'Copied into a new draft. Set its effective date and approve it to use it.' }
}
