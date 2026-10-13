'use server'

import { fetchHiveOfferings } from '@/lib/integrations/hive-offerings'
import { isUuid } from '@/lib/utils'
import { documentErrorMessage } from '../errors'
import { hiveOfferingToLine } from '../hive-offerings'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS, isDocumentKind } from '../vocabulary'

const NOT_FOUND = 'That document was not found.'

function lineError(error: { message?: string; code?: string } | null): string {
  const mapped = documentErrorMessage(error?.message)
  if (mapped) return mapped
  if (error?.code === '42501') return NOT_FOUND
  return 'The line could not be saved. Please try again.'
}

/** Adds one HIVE offering to a document at HIVE's rand price. The browser sends only the offering key: the price is read from HIVE here, never trusted from the form. */
export async function addHiveOfferingLineAction(kind: string, documentId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(documentId)) return { error: NOT_FOUND }
  const key = String(form.get('offeringKey') ?? '').trim()
  if (!/^[a-z0-9_.:-]{1,120}$/i.test(key)) return { error: 'Choose an offering from HIVE.' }
  const { organization, db } = await documentContext()
  const parent = await db.from(DOCUMENTS[kind].table).select('currency').eq('id', documentId).eq('organization_id', organization.id).maybeSingle()
  if (parent.error || !parent.data) return { error: NOT_FOUND }
  if (parent.data.currency !== 'ZAR') return { error: "HIVE prices are in rand. Set this document's currency to ZAR to add them." }

  let line
  try {
    const offering = (await fetchHiveOfferings()).offerings.find((candidate) => candidate.key === key)
    if (!offering) return { error: 'HIVE no longer offers that. Reload the page and choose again.' }
    line = hiveOfferingToLine(offering)
  } catch {
    return { error: 'HIVE offerings are unavailable right now. Try again shortly.' }
  }
  if (!line) return { error: 'HIVE has no approved rand price for that offering. Add it as a one-off line instead.' }

  const info = DOCUMENTS[kind]
  const last = await db.from(info.lines).select('position').eq(info.parentColumn, documentId).eq('organization_id', organization.id).order('position', { ascending: false }).limit(1)
  if (last.error) return { error: lineError(last.error) }
  const position = Number(last.data?.[0]?.position ?? 0) + 1
  const saved = await db.from(info.lines).insert({ organization_id: organization.id, [info.parentColumn]: documentId, position, ...line }).select('id').single()
  if (saved.error || !saved.data) return { error: lineError(saved.error) }
  revalidateDocumentPages()
  return { success: 'Line added from HIVE.' }
}
