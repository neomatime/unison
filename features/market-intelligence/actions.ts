'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import { parseTabularFile } from '@/features/data-portability/file-formats'
import { readImportRows, type ImportProblem } from './import-rows'

export type ImportState =
  | { ok: true; organizations: number; operations: number; added: number; updated: number; problems: ImportProblem[] }
  | { ok: false; error: string; problems?: ImportProblem[] }
  | undefined

const MAX_BYTES = 10 * 1024 * 1024
const BATCH = 1000

/**
 * Imports a verified dataset (CSV or Excel, one row per operation) into the active workspace. Rows with a problem are
 * skipped and listed; the rest are stored. Only owners and admins: market_import checks that again in the database.
 */
export async function importMarketDataAction(_previous: ImportState, form: FormData): Promise<ImportState> {
  const { organization, membership } = await getSessionContext()
  if (membership.roleId !== 'owner' && membership.roleId !== 'admin') return { ok: false, error: 'Only an owner or admin can import market data.' }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a CSV or Excel file.' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'The file is larger than 10 MB. Split it and import the parts.' }
  const extension = file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : file.name.toLowerCase().endsWith('.csv') ? 'csv' : null
  if (!extension) return { ok: false, error: 'Use a .csv or .xlsx file.' }

  let parsed: { headers: string[]; rows: unknown[][] }
  try {
    parsed = await parseTabularFile(Buffer.from(await file.arrayBuffer()), extension)
  } catch {
    return { ok: false, error: 'The file could not be read. Check that it is a CSV or Excel file with a header row.' }
  }
  const { rows, problems } = readImportRows(parsed.headers, parsed.rows)
  if (!rows.length) return { ok: false, error: 'No row could be imported.', problems: problems.slice(0, 50) }

  const db = (await createServerSupabase()) as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Record<string, number> | null; error: { message: string } | null }>
  }
  let added = 0
  let updated = 0
  for (let at = 0; at < rows.length; at += BATCH) {
    const { data, error } = await db.rpc('market_import', { p_organization_id: organization.id, p_rows: rows.slice(at, at + BATCH) })
    if (error || !data) {
      return { ok: false, error: `The import stopped at row ${at + 2}: ${error?.message ?? 'no answer from the database'}. Rows before it were saved.`, problems: problems.slice(0, 50) }
    }
    added += Number(data.operations_added ?? 0)
    updated += Number(data.operations_updated ?? 0)
  }
  revalidatePath('/overview')
  return {
    ok: true,
    organizations: new Set(rows.map((row) => row.organization.match_key)).size,
    operations: rows.filter((row) => row.operation).length,
    added,
    updated,
    problems: problems.slice(0, 50),
  }
}

/**
 * Links a mining organisation to a client or lead that already exists in UNISON, so the map shows the relationship
 * and nobody creates a second record for the same company. The database checks the record is in this workspace.
 */
export async function linkMarketOrganizationAction(marketOrganizationId: string, kind: 'client' | 'lead', recordId: string): Promise<{ error?: string }> {
  if (!isUuid(marketOrganizationId) || !isUuid(recordId) || (kind !== 'client' && kind !== 'lead')) return { error: 'That link is not valid.' }
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any // eslint-disable-line @typescript-eslint/no-explicit-any -- newer than the generated types
  const { data, error } = await db
    .from('market_organizations')
    .update(kind === 'client' ? { client_id: recordId } : { lead_id: recordId })
    .eq('id', marketOrganizationId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error || !data) return { error: 'The organisation could not be linked.' }
  revalidatePath('/overview')
  return {}
}
