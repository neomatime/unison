'use server'

import { redirect } from 'next/navigation'

import { failureState } from '@/features/documents/action-failure'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { DOCUMENTS } from '@/features/documents/vocabulary'
import { isValidIsoDate } from '@/features/delivery/schemas/date'
import { isUuid } from '@/lib/utils'
import { revalidateBillingPages } from '../revalidate'

const NOT_FOUND_CLIENT = 'That client was not found.'
const NOT_FOUND_PACKAGE = 'That package was not found.'

/** An empty date field means "today" (null); a typed one must be a real calendar date. */
function readDate(form: FormData, name: string): { value: string | null } | { error: string } {
  const raw = String(form.get(name) ?? '').trim()
  if (raw === '') return { value: null }
  return isValidIsoDate(raw) ? { value: raw } : { error: 'Enter a valid date.' }
}

export async function setPackageAction(clientId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { error: NOT_FOUND_CLIENT }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  const packageKey = String(form.get('packageKey') ?? '').trim()
  if (!packageKey) return { error: 'Choose a package.' }
  const { db } = await documentContext()
  const result = await db.rpc('set_client_package', { p_client: clientId, p_package_key: packageKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The package could not be recorded. Please try again.')
  revalidateBillingPages()
  return { success: 'Package recorded.' }
}

export async function changeTierAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  if (date.value === null) return { error: 'Enter the date the new tier starts.' }
  const packageKey = String(form.get('packageKey') ?? '').trim()
  if (!packageKey) return { error: 'Choose the new tier.' }
  const { db } = await documentContext()
  const result = await db.rpc('change_retainer_tier', { p_engagement: engagementId, p_new_package_key: packageKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The tier could not be changed. Please try again.')
  revalidateBillingPages()
  return { success: 'Tier changed. No new implementation fee is billed.' }
}

export async function endEngagementAction(engagementId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const { db } = await documentContext()
  const result = await db.rpc('end_engagement', { p_engagement: engagementId, p_ended_on: null })
  if (result.error) return failureState(result.error, 'The package could not be ended. Please try again.')
  revalidateBillingPages()
  return { success: 'Package ended.' }
}

export async function addSupportAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  const serviceKey = String(form.get('serviceKey') ?? '').trim()
  if (!serviceKey) return { error: 'Choose a support service.' }
  const { db } = await documentContext()
  const result = await db.rpc('add_support_service', { p_engagement: engagementId, p_service_key: serviceKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The support service could not be recorded. Please try again.')
  revalidateBillingPages()
  return { success: 'Support service recorded.' }
}

export async function endSupportAction(supportId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(supportId)) return { error: 'That support service was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('end_support_service', { p_support: supportId, p_ended_on: null })
  if (result.error) return failureState(result.error, 'The support service could not be ended. Please try again.')
  revalidateBillingPages()
  return { success: 'Support service ended.' }
}

function openBuilt(kind: 'invoice' | 'quote', id: unknown): never | ActionState {
  if (typeof id !== 'string' || !isUuid(id)) return { error: 'The document was built but could not be opened. Find it in the list.' }
  revalidateBillingPages()
  redirect(`${DOCUMENTS[kind].base}/${id}`)
}

export async function createFirstDocumentAction(engagementId: string, kind: 'invoice' | 'quote', _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  if (kind !== 'invoice' && kind !== 'quote') return { error: 'Choose an invoice or a quote.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_first_document', { p_engagement: engagementId, p_kind: kind })
  if (result.error) return failureState(result.error, 'The document could not be built. Please try again.')
  return openBuilt(kind, result.data)
}

export async function createMonthlyInvoiceAction(clientId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { error: NOT_FOUND_CLIENT }
  const { db } = await documentContext()
  const result = await db.rpc('create_monthly_invoice', { p_client: clientId, p_month: null })
  if (result.error) return failureState(result.error, 'The invoice could not be built. Please try again.')
  return openBuilt('invoice', result.data)
}

export async function createTopUpAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const raw = String(form.get('credits') ?? '').trim()
  if (!/^\d{1,5}$/.test(raw)) return { error: 'Enter a whole number of credits from 1 to 10,000.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_top_up_invoice', { p_engagement: engagementId, p_credits: Number(raw) })
  if (result.error) return failureState(result.error, 'The top-up invoice could not be built. Please try again.')
  return openBuilt('invoice', result.data)
}
