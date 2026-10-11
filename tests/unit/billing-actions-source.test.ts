import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = readFileSync(join(process.cwd(), 'features', 'billing', 'actions', 'billing.ts'), 'utf8')

test('the billing actions are a use-server file that exports only async actions', () => {
  assert.match(source, /^'use server'/)
  const exported = [...source.matchAll(/^export (async )?function (\w+)/gm)]
  assert.equal(exported.length, 9)
  for (const match of exported) assert.ok(match[1], `${match[2]} must be async`)
  assert.equal([...source.matchAll(/^export (?!async function)/gm)].length, 0, 'no non-function exports in a use-server file')
})

test('every action validates its ids and calls exactly its database function', () => {
  const calls: Record<string, string> = {
    setPackageAction: 'set_client_package', changeTierAction: 'change_retainer_tier', endEngagementAction: 'end_engagement',
    addSupportAction: 'add_support_service', endSupportAction: 'end_support_service', createFirstDocumentAction: 'create_first_document',
    createMonthlyInvoiceAction: 'create_monthly_invoice', createTopUpAction: 'create_top_up_invoice',
    discardBillingDraftAction: 'discard_billing_draft',
  }
  for (const [action, rpc] of Object.entries(calls)) {
    const body = source.slice(source.indexOf(`function ${action}`))
    const end = body.indexOf('\nexport ', 10)
    const fn = end === -1 ? body : body.slice(0, end)
    assert.match(fn, /isUuid\(/, `${action} checks its id`)
    assert.ok(fn.includes(`rpc('${rpc}'`), `${action} calls ${rpc}`)
  }
})

test('the document builders never take a price or an amount from the browser', () => {
  assert.doesNotMatch(source, /unit_price|unitPrice|amount/i)
  assert.match(source, /p_credits: Number\(raw\)/)
  assert.match(source, /\/\^\\d\{1,5\}\$\//)
})

const body = (action: string) => {
  const from = source.slice(source.indexOf(`export async function ${action}`))
  const end = from.indexOf('\nexport ', 10)
  return end === -1 ? from : from.slice(0, end)
}

test('the monthly invoice takes an optional YYYY-MM month and checks it before calling the database', () => {
  const fn = body('createMonthlyInvoiceAction')
  assert.match(fn, /String\(form\.get\('month'\) \?\? ''\)\.trim\(\)/)
  const check = fn.indexOf("if (month !== '' && !/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error:")
  assert.ok(check > -1, 'the month is validated')
  assert.ok(check < fn.indexOf('documentContext()'), 'before anything is read')
  assert.match(fn, /p_month: month === '' \? null : `\$\{month\}-01`/, 'empty means this month; a typed month is its first day')
})

test('discarding a draft calls its function, says why it was refused, and refreshes the pages', () => {
  const fn = body('discardBillingDraftAction')
  assert.match(fn, /export async function discardBillingDraftAction\(invoiceId: string, _previous: ActionState, _form: FormData\)/)
  assert.match(fn, /if \(!isUuid\(invoiceId\)\) return/)
  assert.match(fn, /rpc\('discard_billing_draft', \{ p_invoice: invoiceId \}\)/)
  assert.match(fn, /if \(result\.error\) return failureState\(result\.error,/)
  assert.match(fn, /revalidateBillingPages\(\)\s+return \{ success: 'Draft discarded\.' \}/)
})

test('a built document is opened by redirecting to its page', () => {
  assert.match(source, /redirect\(`\$\{DOCUMENTS\[kind\]\.base\}\/\$\{id\}`\)/)
})
