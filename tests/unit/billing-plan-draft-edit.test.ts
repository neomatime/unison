import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PLAN_DRAFT_LOCKED_NOTE } from '../../features/documents/billing-plan-view.ts'

// Accept to invoice, stage 1, final fix wave (Fix B): a draft invoice that follows an accepted quote (it has a billing plan link)
// is edited through the invoice Edit form with its due date and its notes only. The database refuses every other change to it
// (INVOICE_PLAN_LOCKED, tested in billing-approval.test.ts), and a posted value often differs from the stored one in ordinary
// situations (payment terms stored with LF and posted with CRLF, a client renamed since, an archived opportunity, an inactive
// owner), so the save must not write the other columns at all. Source guards in the house style: Git on Windows may check files
// out with CRLF line endings, and the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const action = () => read('features', 'commercial-finance', 'actions', 'phase-six.ts')
const form = () => read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
const mapper = () => read('features', 'commercial-finance', 'phase-six-mappers.ts')

/** The invoice branch of the save action: from its `else if` to the expense branch. */
function invoiceBranch(): string {
  const source = action()
  const start = source.indexOf('} else if (kind === "invoice") {')
  const end = source.indexOf('} else if (kind === "expense") {')
  assert.ok(start > -1 && end > start, 'the invoice branch was found')
  return source.slice(start, end)
}

test('the sentence on the form is the one the brief gives, word for word', () => {
  assert.equal(PLAN_DRAFT_LOCKED_NOTE, 'This invoice follows its accepted quote. Only the due date and the notes can be changed.')
})

test('readDocumentState also returns the billing link of an invoice, and asks for that column of invoices only', () => {
  const source = action()
  const start = source.indexOf('async function readDocumentState(')
  const end = source.indexOf('export async function savePhaseSixRecordAction(')
  assert.ok(start > -1 && end > start)
  const text = source.slice(start, end)
  assert.match(text, /\.select\(table === "invoices" \? "status,total_amount,billing_plan_item_id" : "status,total_amount"\)/, 'quotes have no such column')
  assert.match(text, /planItemId: typeof result\.data\.billing_plan_item_id === "string" \? result\.data\.billing_plan_item_id : null/)
  assert.match(text, /status: String\(result\.data\.status\),\s+total: Number\(result\.data\.total_amount\),/, 'the status and the total are read as before')
})

test('a linked Draft invoice writes only the due date and the notes: no client lookup, no other field, nothing else required of the form', () => {
  const text = invoiceBranch()
  const issued = text.indexOf('if (state && !isDraftStatus("invoice", state.status)) {')
  const linked = text.indexOf('} else if (state?.planItemId) {')
  const unlinked = text.indexOf('} else {', linked)
  assert.ok(issued > -1 && linked > issued && unlinked > linked, 'the issued branch, then the linked draft, then every other draft')
  const branch = text.slice(linked, unlinked)
  assert.match(branch, /values = \{ due_date: optional\(form, "dueDate"\), notes: optional\(form, "notes"\) \};/, 'exactly these two columns')
  assert.equal((branch.match(/\bform\b/g) ?? []).length, 2, 'the form is read twice: the due date and the notes')
  assert.doesNotMatch(branch, /clientName\(|identifier\(|text\(form|number\(form|readDocumentExtras|extras|organization_id|status:|return \{ error/, 'no client lookup, no other field, no requirement, no refusal')
  assert.match(branch, /^\} else if \(state\?\.planItemId\) \{\n\s+\/\/ [^\n]*\n(?:\s+\/\/ [^\n]*\n)*\s+values = /, 'a comment says why, then the values')
})

test('every other Draft invoice (no link, or a new one) is saved exactly as before', () => {
  const text = invoiceBranch()
  const unlinked = text.slice(text.indexOf('} else {', text.indexOf('} else if (state?.planItemId) {')))
  const verbatim = [
    'const resolvedClient = await clientName(db, organization.id, form);',
    'if (resolvedClient.invalid) return { error: "The selected client could not be verified." };',
    'if (!resolvedClient.name) return { error: "Choose a client." };',
    'const contact = optional(form, "contactName");',
    'if (contact && contact.length > 200) return { error: "The client contact is too long (200 characters at most)." };',
    'organization_id: organization.id,',
    'client_id: resolvedClient.clientId,',
    'client_name: resolvedClient.name,',
    'contact_name: contact,',
    'project_id: identifier(form, "projectId"),',
    'quote_id: identifier(form, "quoteId"),',
    'opportunity_id: identifier(form, "opportunityId"),',
    'owner_id: identifier(form, "ownerId"),',
    'due_date: optional(form, "dueDate"),',
    'currency: text(form, "currency") || "ZAR",',
    'status: "Draft",',
    'payment_terms: optional(form, "paymentTerms"),',
    'notes: optional(form, "notes"),',
    '...extras,',
  ]
  for (const line of verbatim) assert.ok(unlinked.includes(line), `still there: ${line}`)
  // The order of the reads before the split and the issued branch are as they were.
  assert.match(text, /const extras = readDocumentExtras\(form\);\n\s+if \("error" in extras\) return \{ error: extras\.error \};\n\s+const state = id && isUuid\(id\) \? await readDocumentState\(db, "invoices", organization\.id, id\) : null;/)
  assert.match(text, /values = \{ notes: optional\(form, "notes"\) \};/, 'an issued invoice still writes only its notes')
})

test('the invoice record carries the item it follows, and the edit form shows a linked draft only the notice, the due date and the notes', () => {
  const mapped = mapper()
  const invoice = mapped.slice(mapped.indexOf("case 'invoice':"), mapped.indexOf("case 'expense':"))
  assert.match(invoice, /billingPlanItemId: row\.billing_plan_item_id \?\? null,/)

  const source = form()
  assert.match(source, /import \{ PLAN_DRAFT_LOCKED_NOTE \} from "@\/features\/documents\/billing-plan-view";/)
  const start = source.indexOf('if (kind === "invoice") {')
  const end = source.indexOf('if (kind === "expense") return (')
  assert.ok(start > -1 && end > start)
  const text = source.slice(start, end)
  const issued = text.indexOf('if (record && !isDraftStatus("invoice", record.status)) {')
  const linked = text.indexOf('if (record && typeof record.billingPlanItemId === "string") {')
  const draft = text.indexOf('<Notice>The invoice number is assigned when the invoice is issued.')
  assert.ok(issued > -1 && linked > issued && draft > linked, 'an issued invoice, then a linked draft, then every other draft')
  const branch = text.slice(linked, draft)
  assert.match(branch, /<Notice>\{PLAN_DRAFT_LOCKED_NOTE\}<\/Notice>/)
  assert.match(branch, /<Field name="dueDate" label="Due date \(default 30 days after it is issued\)" type="date" value=\{value\("dueDate"\)\} \/>/, 'the same due date field as the ordinary draft')
  assert.match(branch, /<TextArea name="notes" label="Payment notes \(internal\)" value=\{value\("notes"\)\} \/>/, 'the same notes field as the ordinary draft')
  const named = [...branch.matchAll(/<(?:Field|TextArea|Select|OptionSelect)\b[^>]*?\bname="(\w+)"/g)].map((match) => match[1])
  assert.deepEqual(named, ['dueDate', 'notes'], 'those two fields and no other')
  assert.doesNotMatch(branch, /<(Currency|ClientFields|ClientContactField|ProjectIdentityFields)\b/, 'no client, currency or project fields')
  // The ordinary draft is as it was.
  for (const part of ['<ClientFields ', '<ClientContactField kind="invoice"', 'name="projectId"', 'name="quoteId"', 'name="opportunityId"', 'name="ownerId"', 'name="dueDate"', '<Currency ', '<ProjectIdentityFields kind="invoice"', 'name="projectDescription"', 'name="paymentTerms"', 'name="notes"']) {
    assert.ok(text.slice(draft).includes(part), `the ordinary draft still has ${part}`)
  }
})
