import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Accept to invoice, stage 1, final fix wave (Fixes A, E and F): source guards on the migration that replaces three functions. The
// behaviour is tested against the database in billing-approval, billing-plan-invoices and quote-billing-terms (rls). Here: that each
// function is replaced whole from its newest definition with the one stated change, and keeps its security, search_path, revoke and
// grant lines. Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const MIGRATIONS = ['supabase', 'migrations']
const migration = () => read(...MIGRATIONS, '20261026110000_billing_final_review_fixes.sql')

/** One function's text: from its `create or replace function` line to its grant (or revoke) line. */
function functionText(source: string, signature: string, lastLine: string): string {
  const start = source.indexOf(`create or replace function ${signature}`)
  assert.ok(start > -1, `${signature} is replaced`)
  const end = source.indexOf(lastLine, start)
  assert.ok(end > -1, `${signature} ends with its grants`)
  return source.slice(start, end + lastLine.length)
}

/** The lines of `after` that are not in `before` and the lines of `before` that are not in `after`, so a change can be named. */
function changedLines(before: string, after: string) {
  const left = before.split('\n')
  const right = after.split('\n')
  return { removed: left.filter((line) => !right.includes(line)), added: right.filter((line) => !left.includes(line)) }
}

const PLAN_INVOICES = '20261026101000_billing_plan_invoices.sql'
const DUPLICATE_GUARD = '20261026101500_billing_duplicate_guard_fix.sql'
const QUOTE_TERMS = '20261026105000_quote_billing_terms_send.sql'

test('the migration replaces exactly three functions, each with an empty search_path and its grants restated', () => {
  const sql = migration()
  assert.equal((sql.match(/create or replace function /g) ?? []).length, 3, 'three functions')
  assert.equal((sql.match(/security definer/g) ?? []).length, 3, 'each one runs as the owner')
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 3, 'each one has an empty search_path')
  assert.ok(sql.includes('revoke all on function private.build_plan_item_invoice(uuid) from public, anon, authenticated;'))
  assert.ok(sql.includes('revoke all on function public.create_invoice_from_quote(uuid) from public, anon;'))
  assert.ok(sql.includes('grant execute on function public.create_invoice_from_quote(uuid) to authenticated;'))
  assert.ok(sql.includes('revoke all on function public.duplicate_quote(uuid) from public, anon;'))
  assert.ok(sql.includes('grant execute on function public.duplicate_quote(uuid) to authenticated;'))
  assert.doesNotMatch(sql, /grant execute on function private\./, 'the private function is granted to nobody')
})

test('a discarded plan draft is deleted instead of unlinked when its month is built again, and nothing else in build_plan_item_invoice changes', () => {
  const before = functionText(read(...MIGRATIONS, PLAN_INVOICES), 'private.build_plan_item_invoice(p_item_id uuid) returns uuid', 'revoke all on function private.build_plan_item_invoice(uuid) from public, anon, authenticated;')
  const after = functionText(migration(), 'private.build_plan_item_invoice(p_item_id uuid) returns uuid', 'revoke all on function private.build_plan_item_invoice(uuid) from public, anon, authenticated;')
  const changed = changedLines(before, after)
  assert.deepEqual(changed.removed, ['  update public.invoices i set billing_plan_item_id = null'])
  assert.deepEqual(changed.added, ['  delete from public.invoices i'])
  assert.match(after, /delete from public\.invoices i\n\s+where i\.billing_plan_item_id = p_item_id and i\.organization_id = v_item\.organization_id\n\s+and i\.archived_at is not null and i\.status = 'Draft';/, 'only an archived Draft of this item, in the item\'s organisation')
  // Cancelling it instead is not possible: the table allows a DRAFT- reference only on a Draft, and a draft never had a real number.
  assert.doesNotMatch(after, /status = 'Cancelled'/)
  assert.match(read(...MIGRATIONS, '20261011100000_documents_tables.sql'), /add constraint invoices_draft_reference_only_in_draft\n\s+check \(status = 'Draft' or invoice_number !~ '\^DRAFT-'\);/, 'the constraint that rules out cancelling it is still there')
})

test('the Create invoice button builds a plan only for a client that is not archived, and nothing else in create_invoice_from_quote changes', () => {
  const last = 'grant execute on function public.create_invoice_from_quote(uuid) to authenticated;'
  const before = functionText(read(...MIGRATIONS, DUPLICATE_GUARD), 'public.create_invoice_from_quote(p_quote_id uuid)', last)
  const after = functionText(migration(), 'public.create_invoice_from_quote(p_quote_id uuid)', last)
  const changed = changedLines(before, after)
  assert.equal(changed.removed.length, 1, 'one line of the condition is rewritten')
  assert.match(changed.removed[0], /and coalesce\(\(select s\.billing_plans_enabled from public\.organization_settings s where s\.organization_id = v_org\), false\) then$/)
  assert.deepEqual(changed.added, [
    '     and coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_org), false)',
    '     and not (v_quote.client_id is not null and exists (',
    '       select 1 from public.clients c',
    '       where c.id = v_quote.client_id and c.organization_id = v_org and c.archived_at is not null)) then',
  ])
  // The plan branch is the one with the condition, and it still ends in the plan's first invoice; the plain copy follows it.
  const branch = after.indexOf('and not (v_quote.client_id is not null and exists (')
  const plan = after.indexOf('v_plan := private.ensure_billing_plan(p_quote_id);')
  const plain = after.indexOf('insert into public.invoices (')
  assert.ok(branch > -1 && plan > branch && plain > plan, 'the condition guards the plan branch, which comes before the plain copy')
})

test('a duplicate of a quote carries no start date or term, and nothing else in duplicate_quote changes; revise_quote is not replaced', () => {
  const last = 'grant execute on function public.duplicate_quote(uuid) to authenticated;'
  const before = functionText(read(...MIGRATIONS, QUOTE_TERMS), 'public.duplicate_quote(p_id uuid) returns uuid', last)
  const sql = migration()
  const after = functionText(sql, 'public.duplicate_quote(p_id uuid) returns uuid', last)
  const changed = changedLines(before, after)
  assert.deepEqual(changed.removed, [
    '    terms, notes, project_name, project_description, project_ref, client_ref, start_date, term_months)',
    '    v_src.project_ref, v_src.client_ref, v_src.start_date, v_src.term_months)',
  ])
  assert.deepEqual(changed.added, [
    '    terms, notes, project_name, project_description, project_ref, client_ref)',
    '    v_src.project_ref, v_src.client_ref)',
  ])
  assert.doesNotMatch(after, /start_date|term_months/, 'the copy names neither column')
  assert.doesNotMatch(sql, /function public\.revise_quote/, 'a revision keeps copying the terms, as before')
})

test('the migration is plain ASCII and names the newest definition of each function it replaces', () => {
  const sql = migration()
  assert.doesNotMatch(sql, /[^\n -~]/, 'plain ASCII')
  for (const name of [PLAN_INVOICES, DUPLICATE_GUARD, QUOTE_TERMS]) assert.ok(sql.includes(name), `${name} is named as a source`)
})
