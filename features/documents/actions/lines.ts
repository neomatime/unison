'use server'

import { isUuid } from '@/lib/utils'
import { documentErrorMessage } from '../errors'
import { readLineFields } from '../fields'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS, isDocumentKind } from '../vocabulary'

const NOT_FOUND = 'That document was not found.'

function lineError(error: { message?: string; code?: string } | null): string {
  const mapped = documentErrorMessage(error?.message)
  if (mapped) return mapped
  if (error?.code === '23503') return 'That price list item or document no longer exists.'
  if (error?.code === '42501') return NOT_FOUND
  return 'The line could not be saved. Check the quantity and the price.'
}

export async function addLineAction(kind: string, documentId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(documentId)) return { error: NOT_FOUND }
  const fields = readLineFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await documentContext()
  const info = DOCUMENTS[kind]
  const last = await db
    .from(info.lines)
    .select('position')
    .eq(info.parentColumn, documentId)
    .eq('organization_id', organization.id)
    .order('position', { ascending: false })
    .limit(1)
  if (last.error) return { error: lineError(last.error) }
  const position = Number(last.data?.[0]?.position ?? 0) + 1
  const saved = await db
    .from(info.lines)
    .insert({ organization_id: organization.id, [info.parentColumn]: documentId, position, ...fields })
    .select('id')
    .single()
  if (saved.error || !saved.data) return { error: lineError(saved.error) }
  revalidateDocumentPages()
  return { success: 'Line added.' }
}

export async function updateLineAction(kind: string, lineId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(lineId)) return { error: NOT_FOUND }
  const fields = readLineFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await documentContext()
  const saved = await db
    .from(DOCUMENTS[kind].lines)
    .update(fields)
    .eq('id', lineId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (saved.error) return { error: lineError(saved.error) }
  if (!saved.data) return { error: 'That line no longer exists.' }
  revalidateDocumentPages()
  return { success: 'Line saved.' }
}

export async function removeLineAction(kind: string, lineId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(lineId)) return { error: NOT_FOUND }
  const { organization, db } = await documentContext()
  const removed = await db
    .from(DOCUMENTS[kind].lines)
    .delete()
    .eq('id', lineId)
    .eq('organization_id', organization.id)
    .select('id')
  if (removed.error) return { error: lineError(removed.error) }
  if (!removed.data?.length) return { error: 'That line no longer exists.' }
  revalidateDocumentPages()
  return { success: 'Line removed.' }
}

/** Swaps a line with its neighbour and renumbers the document's lines 1..n. */
export async function moveLineAction(
  kind: string,
  documentId: string,
  lineId: string,
  direction: 'up' | 'down',
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(documentId) || !isUuid(lineId)) return { error: NOT_FOUND }
  if (direction !== 'up' && direction !== 'down') return { error: 'That move is not valid.' }
  const { organization, db } = await documentContext()
  const info = DOCUMENTS[kind]
  const read = await db
    .from(info.lines)
    .select('id,position')
    .eq(info.parentColumn, documentId)
    .eq('organization_id', organization.id)
    .order('position')
    .order('created_at')
  if (read.error) return { error: lineError(read.error) }
  const ordered: Array<{ id: string; position: number }> = [...(read.data ?? [])]
  const index = ordered.findIndex((line) => line.id === lineId)
  if (index < 0) return { error: 'That line no longer exists.' }
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ordered.length) return { success: 'Already there.' }
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  for (const [position, line] of ordered.entries()) {
    if (Number(line.position) === position + 1) continue
    const moved = await db
      .from(info.lines)
      .update({ position: position + 1 })
      .eq('id', line.id)
      .eq('organization_id', organization.id)
      .select('id')
      .maybeSingle()
    if (moved.error) return { error: lineError(moved.error) }
    if (!moved.data) return { error: 'That line no longer exists.' }
  }
  revalidateDocumentPages()
  return { success: 'Moved.' }
}

/** Adds one rate card item to a draft document at its fixed price (a locked line). Only a key and, for top-up credits, a whole quantity come from the browser. */
export async function addRateCardLineAction(kind: string, documentId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(documentId)) return { error: NOT_FOUND }
  const rateKey = String(form.get('rateKey') ?? '').trim()
  if (!/^[a-z0-9_.]{1,80}$/.test(rateKey)) return { error: 'Choose an item from the rate card.' }
  const rawQuantity = String(form.get('quantity') ?? '1').trim() || '1'
  if (!/^\d{1,5}$/.test(rawQuantity)) return { error: 'Enter a whole number of credits.' }
  const { db } = await documentContext()
  const added = await db.rpc('add_rate_card_line', { p_kind: kind, p_document: documentId, p_rate_key: rateKey, p_quantity: Number(rawQuantity) })
  if (added.error) return { error: documentErrorMessage(added.error.message) ?? 'The line could not be added. Please try again.' }
  revalidateDocumentPages()
  return { success: 'Line added from the rate card.' }
}
