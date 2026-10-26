import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the billing plan on the quote page (accept to invoice, stage 1, task 9): the three server actions, the
// queries, the panel, the plan controls, and the two pages and the header buttons that carry them. Git on Windows may check files
// out with CRLF line endings; the guards match on LF. The wording is in billing-plan-view.test.ts.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

/** Zero-width, bidi-control and byte-order-mark code points: none may appear raw in source. */
const isInvisible = (code: number) =>
  (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x2064) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff

const FILES = {
  view: ['features', 'documents', 'billing-plan-view.ts'],
  plan: ['features', 'documents', 'queries', 'get-billing-plan.ts'],
  link: ['features', 'documents', 'queries', 'get-plan-link.ts'],
  actions: ['features', 'documents', 'actions', 'billing-plan.ts'],
  panel: ['features', 'documents', 'components', 'billing-plan-panel.tsx'],
  controls: ['features', 'documents', 'components', 'billing-plan-state-form.tsx'],
} as const
const NEW_FILES = Object.entries(FILES) as Array<[string, readonly string[]]>

const view = () => read(...FILES.view)
const plan = () => read(...FILES.plan)
const link = () => read(...FILES.link)
const actions = () => read(...FILES.actions)
const panel = () => read(...FILES.panel)
const controls = () => read(...FILES.controls)
const quotePage = () => read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')
const invoicePage = () => read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')
const documentActions = () => read('features', 'documents', 'components', 'document-actions.tsx')

/** One exported function's text: from its signature to the next export (or the end of the file). */
function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > -1, `${name} must be exported`)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const APPROVE = 'approveFirstInvoiceAction'
const CREATE = 'createPlanItemInvoiceAction'
const STATE = 'setBillingPlanStateAction'
const RPC = /\bdb\s*\.\s*rpc\(\s*'([a-z_]+)'/g

// ---------------------------------------------------------------------------------------------------------------
// The actions
// ---------------------------------------------------------------------------------------------------------------

test('the actions module is a server-action module that exports three async functions and nothing else', () => {
  const source = actions()
  assert.match(source, /^'use server'/, 'it must be a server-action module')
  const exported = source.split('\n').filter((line) => /^export\b/.test(line))
  assert.deepEqual(exported, [
    'export async function approveFirstInvoiceAction(itemId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {',
    'export async function createPlanItemInvoiceAction(itemId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {',
    "export async function setBillingPlanStateAction(planId: string, action: 'pause' | 'resume' | 'end', _previous: ActionState, form: FormData): Promise<ActionState> {",
  ])
  assert.doesNotMatch(source, /^export (const|let|var|type|interface|default|\{|\*)/m, 'a use-server file exports only async functions')
  assert.match(source, /import type \{ ActionState \} from '\.\.\/types'/)
})

test('each action checks the id, reads the session, then makes exactly one database call: the rpc it is named for', () => {
  const expected: Array<[string, string]> = [[APPROVE, 'approve_first_invoice'], [CREATE, 'create_plan_item_invoice'], [STATE, 'billing_plan_set_state']]
  for (const [name, rpc] of expected) {
    const text = body(actions(), name)
    const calls = [...text.matchAll(RPC)].map((match) => match[1])
    assert.deepEqual(calls, [rpc], `${name} calls ${rpc} once`)
    assert.equal((text.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1, `${name}: no other database call`)
    const uuid = text.search(/if \(!isUuid\((itemId|planId)\)\) return \{ error: '/)
    const context = text.indexOf('await documentContext()')
    const rpcAt = text.search(RPC)
    assert.ok(uuid > -1 && context > uuid && rpcAt > context, `${name}: the id check, then documentContext(), then the rpc`)
  }
  assert.doesNotMatch(actions(), /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/, 'the actions use the signed-in client only')
})

test('approving asks for company.manage before the first database call, in the words of the database', () => {
  const text = body(actions(), APPROVE)
  const context = text.indexOf('await documentContext()')
  const permission = text.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = text.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(context > -1 && permission > -1 && firstDb > -1)
  assert.ok(context < permission && permission < firstDb, 'documentContext(), then the permission check, then the first database call')
  assert.match(text, /if \(!roleHasPermission\(role, 'company\.manage'\)\) return \{ error: BILLING_PLAN_COPY\.approveAdminOnly \}/)
  assert.match(actions(), /import \{ roleHasPermission \} from '@\/config\/roles'/)
})

test('pausing, resuming and ending ask for company.manage before the database too, and check the action word', () => {
  const text = body(actions(), STATE)
  const context = text.indexOf('await documentContext()')
  const permission = text.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = text.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(context > -1 && permission > context && firstDb > permission, 'documentContext(), then the permission check, then the rpc')
  assert.match(text, /if \(!roleHasPermission\(role, 'company\.manage'\)\) return \{ error: BILLING_PLAN_COPY\.planAdminOnly \}/)
  assert.match(text, /if \(action !== 'pause' && action !== 'resume' && action !== 'end'\) return \{ error: /, 'the word is checked, whatever the caller passed')
})

test('creating a month\'s invoice is open to any member: no role check, the database decides', () => {
  const text = body(actions(), CREATE)
  assert.doesNotMatch(text, /roleHasPermission|company\.manage/, 'any member may make a draft')
  assert.match(text, /\.rpc\('create_plan_item_invoice', \{ p_item_id: itemId \}\)/)
  assert.match(text, /return \{ success: BILLING_PLAN_COPY\.draftCreated \}/)
})

test('the plan state action reads only the reason from the form, and passes the id and the word it was bound to', () => {
  const text = body(actions(), STATE)
  const reads = [...text.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["get('reason')"], 'no other field is read from the form')
  assert.match(text, /\.rpc\('billing_plan_set_state', \{ p_plan_id: planId, p_action: action, p_reason: reason \}\)/)
  for (const name of [APPROVE, CREATE]) {
    assert.doesNotMatch(body(actions(), name), /\b_form\s*\./, `${name} never reads the form it is given`)
  }
})

test('every action maps a database refusal through the token sentences, never raw and never 42501 as not found', () => {
  const source = actions()
  for (const name of [APPROVE, CREATE, STATE]) {
    assert.match(body(source, name), /return failureState\(\w+\.error, BILLING_PLAN_COPY\.fallback\)/, `${name} maps its refusal`)
  }
  assert.doesNotMatch(source, /42501/, 'BILLING_APPROVAL_ADMIN_ONLY is raised with 42501: its own sentence must show')
  assert.doesNotMatch(source, /error: [^}\n]*\.message/, 'the raw database message is never returned')
  assert.match(source, /import \{ failureState \} from '\.\.\/action-failure'/)
})

test('every action refreshes the pages after its rpc, and a refused approval refreshes them too so the page lists what is missing', () => {
  const source = actions()
  for (const name of [APPROVE, CREATE, STATE]) {
    const text = body(source, name)
    assert.ok(text.indexOf('revalidateDocumentPages()') > text.search(RPC), `${name}: revalidate after the rpc`)
  }
  const approve = body(source, APPROVE)
  const refused = approve.indexOf('if (approved.error) {')
  assert.ok(refused > -1, 'a refusal has a block of its own')
  const block = approve.slice(refused, approve.indexOf('\n  }\n', refused))
  assert.match(block, /parseChecksFailed\(approved\.error\.message\)\.length > 0/, 'a failed check is told apart from the other refusals')
  assert.match(block, /revalidateDocumentPages\(\)/)
  assert.match(block, /return failureState\(approved\.error, BILLING_PLAN_COPY\.fallback\)/)
  assert.match(source, /import \{ revalidateDocumentPages \} from '\.\.\/revalidate'/)
})

test('after the approval the invoice is emailed through the existing email action, from the defaults, and only that proves "emailed"', () => {
  const text = body(actions(), APPROVE)
  const approvedAt = text.indexOf("rpc('approve_first_invoice'")
  const bundleAt = text.indexOf("getDocument('invoice', invoiceId)")
  const defaultsAt = text.indexOf("getEmailDefaults('invoice', bundle)")
  const emailAt = text.indexOf("emailDocumentAction('invoice', invoiceId, undefined, ")
  assert.ok(approvedAt > -1 && bundleAt > approvedAt && defaultsAt > bundleAt && emailAt > defaultsAt, 'approve, load the invoice, take the defaults, then email')
  assert.equal((text.match(/emailDocumentAction\(/g) ?? []).length, 1, 'one email call')
  for (const field of ['to', 'subject', 'body']) assert.match(text, new RegExp(`\\.set\\('${field}', `), `the ${field} field is given to the email action`)
  assert.match(text, /new FormData\(\)/)
  assert.match(actions(), /import \{ emailDocumentAction \} from '\.\/email'/)
  assert.match(actions(), /import \{ getEmailDefaults \} from '\.\.\/queries\/get-email-defaults'/)
  assert.match(actions(), /import \{ getDocument \} from '\.\.\/queries\/get-document'/)
  // The word "emailed" is a success only in the branch where the email action itself returned success.
  assert.equal((text.match(/approved and emailed/g) ?? []).length, 1, 'one success sentence that says emailed')
  assert.match(text, /if \(sent\?\.success\) return \{ success: `Invoice \$\{number\} approved and emailed to \$\{defaults\.to\}\.` \}/)
  // Every other way out after the approval is an error that says it is approved and issued but not emailed.
  const afterApproval = text.slice(text.indexOf('if (approved.error) {'))
  assert.equal((afterApproval.match(/return \{ success/g) ?? []).length, 1, 'no other success after the approval')
  assert.match(text, /return \{ error: approvedNotEmailedSentence\(number, sent\?\.error \?\? /)
})

test('a failure while the email is being prepared or sent cannot hide that the invoice is already approved', () => {
  const text = body(actions(), APPROVE)
  const tryAt = text.indexOf('try {')
  const emailAt = text.indexOf('emailDocumentAction(')
  const catchAt = text.indexOf('} catch (')
  assert.ok(tryAt > text.indexOf("rpc('approve_first_invoice'") && emailAt > tryAt && catchAt > emailAt, 'the email step sits in a try, after the approval')
  const handler = text.slice(catchAt)
  assert.match(handler, /console\.error\('\[documents:billing-plan\]'/)
  assert.match(handler, /return \{ error: approvedNotEmailedSentence\(number, /)
  assert.match(text, /if \(!bundle\) return \{ error: approvedNotEmailedSentence\(number, /, 'no invoice to load')
  assert.match(text, /if \(!defaults\.to\) return \{ error: approvedNotEmailedSentence\(number, /, 'no address to send to: the email action is not called')
})

test('the sentence for an email that went out but was not recorded is pinned to the email action\'s own', () => {
  assert.ok(read('features', 'documents', 'actions', 'email.ts').includes(`return { error: "Sent, but we couldn't record it." }`), 'the email action still says exactly this')
  assert.ok(view().includes(`export const EMAIL_SENT_NOT_RECORDED = "Sent, but we couldn't record it."`))
})

test('no success sentence of the actions says paid, and the words handed off, synced and completed are nowhere in the new files', () => {
  const successes = [...actions().matchAll(/success: ([`'"])(.*?)\1/g)].map((match) => match[2])
  assert.equal(successes.length, 1, 'the one literal success sentence (the approval that was emailed) was found')
  for (const sentence of successes) assert.doesNotMatch(sentence, /paid/i, sentence)
  // The other success sentences are named in the wording file.
  assert.equal([...actions().matchAll(/success: BILLING_PLAN_COPY\.(\w+)(?:\[action\])?/g)].map((match) => match[1]).join(','), 'draftCreated,stateDone')
  const copy = view().match(/draftCreated: '[^']*',\n\s+stateDone: \{[^}]*\}/)
  assert.ok(copy, 'the draft and state sentences are in the view file')
  assert.doesNotMatch(copy[0], /paid/i)
  for (const [name, parts] of NEW_FILES) {
    const source = read(...parts)
    assert.doesNotMatch(source, /handed off|synced|completed/i, `${name} avoids those words`)
  }
  // "Paid" and "Partially Paid" are invoice statuses worked out from recorded payments; nothing else in the wording says paid.
  for (const [name, parts] of NEW_FILES) {
    const stray = read(...parts)
      .split('\n')
      .filter((line) => /\bpaid\b/i.test(line) && !/'Paid'|Partially Paid|'paid'/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
    assert.deepEqual(stray, [], `${name}: "paid" only as a recorded status`)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The queries
// ---------------------------------------------------------------------------------------------------------------

test('getBillingPlan is a server-only read through the member\'s own client, scoped to the organisation, and writes nothing', () => {
  const source = plan()
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /export async function getBillingPlan\(quoteId: string\): Promise<BillingPlanView \| null>/)
  assert.match(source, /await documentContext\(\)/)
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/)
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/, 'a read')
  assert.match(source, /\.from\('billing_plans'\)[\s\S]*?\.eq\('quote_id', quoteId\)[\s\S]*?\.eq\('organization_id', organization\.id\)[\s\S]*?\.maybeSingle\(\)/)
  assert.match(source, /\.from\('billing_plan_items'\)[\s\S]*?\.eq\('plan_id', [\w.]+\)[\s\S]*?\.order\('month_number'\)/)
  assert.match(source, /\.from\('invoices'\)[\s\S]*?\.in\('billing_plan_item_id', /)
  assert.match(source, /canManage: roleHasPermission\(role, 'company\.manage'\)/)
  assert.match(source, /if \(!plan\.data\) return null/, 'null when the quote has no plan')
})

test('a discarded (archived) Draft does not hold its month, as the database lets it go', () => {
  const source = plan()
  assert.match(source, /archived_at/)
  assert.match(source, /status === 'Draft' && row\.archived_at/, 'an archived Draft is not the item\'s invoice')
})

test('the readiness check runs only for a first invoice that is awaiting approval, and the email check only once it has gone out', () => {
  const source = plan()
  assert.equal((source.match(/billing_invoice_readiness/g) ?? []).length, 1)
  const readiness = source.indexOf("rpc('billing_invoice_readiness', { p_invoice_id:")
  assert.ok(readiness > -1, 'the readiness call is there')
  const guard = source.lastIndexOf('if (', readiness)
  assert.ok(guard > -1 && source.slice(guard, readiness).includes('isAwaitingApproval('), 'the call sits in an if on isAwaitingApproval')
  const emailed = source.indexOf(".from('document_emails')")
  assert.ok(emailed > -1)
  assert.match(source.slice(emailed, emailed + 300), /\.eq\('invoice_id', [\w.]+\)[\s\S]*?\.eq\('organization_id', organization\.id\)[\s\S]*?\.limit\(1\)/)
  assert.match(source.slice(source.lastIndexOf('if (', emailed), emailed), /status !== 'Draft'/, 'only an invoice that is not a Draft can have been emailed')
  assert.match(source, /if \(readiness\.error\) throw readiness\.error/)
})

test('getPlanLink finds the plan item of an invoice and its quote, read only, once per request', () => {
  const source = link()
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /import \{ cache \} from 'react'/)
  assert.match(source, /export const getPlanLink = cache\(async \(invoiceId: string\)/)
  assert.match(source, /\.from\('billing_plan_items'\)[\s\S]*?\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /\.from\('quotes'\)[\s\S]*?\.select\('quote_number'\)[\s\S]*?\.eq\('organization_id', organization\.id\)/)
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\(/, 'a read')
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/)
})

// ---------------------------------------------------------------------------------------------------------------
// The panel and its controls
// ---------------------------------------------------------------------------------------------------------------

test('the panel is a server component that renders nothing without a plan, with the title from the wording file', () => {
  const source = panel()
  assert.doesNotMatch(source, /^\s*['"]use client['"]/m, 'a server component')
  assert.match(source, /export async function BillingPlanPanel\(\{ quoteId \}: \{ quoteId: string \}\)/)
  assert.match(source, /const view = await getBillingPlan\(quoteId\)\n\s+if \(!view\) return null/)
  assert.match(source, /<WorkspaceSection\s+title=\{BILLING_PLAN_COPY\.title\}/)
  assert.match(source, /todayInJohannesburg\(\)/, 'today is the South African day')
})

test('the panel shows the status line and the agreement sentence without a monthly figure, the date formatted by the caller', () => {
  const source = panel()
  assert.match(source, /planStatusLine\(view\.plan\)/)
  assert.match(source, /agreementSentence\(\{ monthly: null, termMonths: view\.plan\.termMonths, startDateLabel: formatDocumentDate\(view\.plan\.startDate\) \}\)/)
})

test('the table gives each month its label from describePlanItem and a link to its invoice', () => {
  const source = panel()
  assert.match(source, /describePlanItem\(item, item\.invoice, today\)/)
  assert.match(source, /href=\{`\$\{DOCUMENTS\.invoice\.base\}\/\$\{item\.invoice\.id\}`\}/)
  assert.match(source, /isDraftReference\(item\.invoice\.number\) \? 'Draft invoice' : item\.invoice\.number/)
  assert.match(source, /formatDocumentDate\(item\.billOn\)/)
})

test('Approve and send is rendered only inside a canManage branch, on the first invoice while it awaits approval and nothing blocks it', () => {
  const source = panel()
  assert.equal((source.match(/BILLING_PLAN_COPY\.approveLabel/g) ?? []).length, 1, 'one Approve and send button')
  assert.equal((source.match(/approveFirstInvoiceAction/g) ?? []).length, 2, 'imported once, used once')
  assert.doesNotMatch(source, /Approve and send/, 'the words come from the wording file, not a second copy')
  const button = source.indexOf('BILLING_PLAN_COPY.approveLabel')
  const manage = source.lastIndexOf('view.canManage ? (', button)
  assert.ok(manage > -1, 'a canManage branch comes before the button')
  assert.ok(button - manage < 600, 'and the button is inside it')
  assert.doesNotMatch(source.slice(manage, button), /\) : \(/, 'not in the else branch')
  assert.match(source.slice(manage, button), /approveFirstInvoiceAction\.bind\(null, firstItem\.id\)/)
  assert.match(source.slice(button, button + 200), /confirmText=\{BILLING_PLAN_COPY\.approveConfirm\}/)
  // Awaiting approval and no blockers decide whether the branch is reached at all.
  const reached = source.lastIndexOf('awaiting', manage)
  assert.ok(reached > -1 && source.slice(reached, manage).includes('blockers.length'), 'the awaiting-approval and blockers conditions come first')
  // A person who cannot approve is told so instead of being shown a button that would be refused.
  assert.match(source, /BILLING_PLAN_COPY\.approveAdminOnly/)
})

test('with blockers the button is replaced by their sentences under the heading', () => {
  const source = panel()
  assert.match(source, /view\.blockers\.length > 0/)
  assert.match(source, /BILLING_PLAN_COPY\.blockersHeading/)
  assert.match(source, /view\.blockers\.map\(\(code\) => \(\s*<li key=\{code\}[^>]*>\{blockerSentence\(code\)\}<\/li>/)
  const blocked = source.indexOf('view.blockers.length > 0')
  const button = source.indexOf('BILLING_PLAN_COPY.approveLabel')
  assert.ok(blocked < button, 'the blockers branch is the first branch; the button is only reached when it is empty')
})

test('Approved, not yet emailed shows while the first invoice is Issued and no email is on record', () => {
  const source = panel()
  assert.match(source, /firstItem\?\.invoice\?\.status === 'Issued' && !view\.emailed/)
  assert.match(source, /BILLING_PLAN_COPY\.approvedNotEmailed/)
})

test('Create invoice is offered through canCreateItemInvoice, to any member, as a button that makes a draft', () => {
  const source = panel()
  assert.match(source, /canCreateItemInvoice\(item, item\.invoice, view\.plan\.status, today\)/)
  assert.match(source, /createPlanItemInvoiceAction\.bind\(null, item\.id\)/)
  assert.match(source, /label=\{BILLING_PLAN_COPY\.createLabel\}/)
  const create = source.indexOf('createPlanItemInvoiceAction.bind')
  const gate = source.lastIndexOf('canCreateItemInvoice(', create)
  assert.ok(gate > -1 && source.slice(gate, create).length < 300 && !source.slice(gate, create).includes('canManage'), 'behind the gate, with no role condition')
})

test('pause, resume and end are shown to owners and admins only, as the client forms, on a plan that can still change', () => {
  const source = panel()
  assert.match(source, /import \{ BillingPlanStateForm \} from '\.\/billing-plan-state-form'/)
  const uses = [...source.matchAll(/<BillingPlanStateForm\b/g)].map((match) => match.index ?? -1)
  assert.equal(uses.length, 3, 'three controls')
  const manage = source.indexOf('view.canManage && view.plan.status !== \'ended\'')
  assert.ok(manage > -1, 'behind canManage, and not on an ended plan')
  for (const at of uses) assert.ok(at > manage, 'every control comes after the gate')
  assert.match(source, /view\.plan\.status === 'active' \? <BillingPlanStateForm key="pause" planId=\{view\.plan\.id\} action="pause" \/> : null/)
  assert.match(source, /view\.plan\.status === 'paused' \? <BillingPlanStateForm key="resume" planId=\{view\.plan\.id\} action="resume" \/> : null/)
  assert.match(source, /<BillingPlanStateForm key="end" planId=\{view\.plan\.id\} action="end" \/>/)
})

test('the plan controls are a client form that calls its action by hand, keeps the reason on an error and asks before ending', () => {
  const source = controls()
  assert.match(source, /^'use client'/)
  assert.doesNotMatch(source, /server-only|lib\/supabase|lib\/email|server-context|next\/headers|\/queries\//, 'a client component imports no server code')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/)
  assert.match(source, /import \{ setBillingPlanStateAction \} from '\.\.\/actions\/billing-plan'/)
  assert.match(source, /useActionState\(setBillingPlanStateAction\.bind\(null, planId, action\), undefined\)/)
  assert.match(source, /export function BillingPlanStateForm\(\{ planId, action \}: \{ planId: string; action: 'pause' \| 'resume' \| 'end' \}\)/)
  assert.doesNotMatch(source, /<form\s+action=/, 'React resets a <form action> after it runs, and the reason would be lost on an error')
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
  assert.match(source, /name="reason"/)
  assert.match(source, /required=\{control\.reasonRequired\}/)
  assert.match(source, /maxLength=\{500\}/)
  assert.match(source, /if \(control\.confirmText && !window\.confirm\(control\.confirmText\)\) return/, 'the end button asks first')
  assert.match(source, /<FormError message=\{state\?\.error\} \/>/)
})

test('the panel imports no client-only or server-only surprises and uses the existing button and badge', () => {
  const source = panel()
  assert.match(source, /import \{ ActionButton \} from '@\/features\/crm-workspace\/components\/action-button'/)
  assert.match(source, /import \{ StatusBadge \} from '@\/components\/ui\/status-badge'/)
  assert.match(source, /import \{ WorkspaceSection \} from '@\/features\/crm-workspace\/components\/workspace-section'/)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/)
})

// ---------------------------------------------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------------------------------------------

test('the quote page mounts the billing plan panel right after the client portal panel, before the HIVE status', () => {
  const source = quotePage()
  assert.match(source, /import \{ BillingPlanPanel \} from '@\/features\/documents\/components\/billing-plan-panel'/)
  const portal = source.indexOf('<ClientResponsePanel quoteId={quoteId} />')
  const billing = source.indexOf('<BillingPlanPanel quoteId={quoteId} />')
  const hive = source.indexOf('<HiveFeedStatus quoteId={quoteId} />')
  assert.ok(portal > -1 && billing > portal && hive > billing, 'ClientResponsePanel, then BillingPlanPanel, then HiveFeedStatus')
  assert.equal(source.slice(portal + '<ClientResponsePanel quoteId={quoteId} />'.length, billing).trim(), '', 'nothing between the two')
})

test('the header buttons hide Issue invoice for the first invoice of a plan, and nothing else about them changes', () => {
  const source = documentActions()
  assert.match(source, /planFirstDraft = false/, 'the flag defaults to false')
  assert.match(source, /planFirstDraft\?: boolean/)
  assert.match(source, /\{kind === 'invoice' && draft && !planFirstDraft \? \(\s*<ActionButton action=\{issueInvoiceAction\.bind\(null, id\)\} label="Issue invoice"/)
  assert.equal((source.match(/label="Issue invoice"/g) ?? []).length, 1)
  assert.match(source, /\{kind === 'invoice' && !draft && !cancelled && !hasPayments \? \(/, 'cancel is as before')
})

test('the invoice page passes the flag from the plan link and shows the banner linking to the quote', () => {
  const source = invoicePage()
  assert.match(source, /import \{ getPlanLink \} from '@\/features\/documents\/queries\/get-plan-link'/)
  assert.match(source, /isFirstPlanDraft\(planLink\?\.kind, String\(bundle\.record\.status\)\)/)
  assert.match(source, /<DocumentActions kind="invoice" id=\{invoiceId\} status=\{String\(bundle\.record\.status\)\} hasPayments=\{hasPayments\} planFirstDraft=\{planFirstDraft\} \/>/)
  assert.match(source, /FIRST_INVOICE_BANNER\.before/)
  assert.match(source, /FIRST_INVOICE_BANNER\.after/)
  assert.match(source, /href=\{`\$\{DOCUMENTS\.quote\.base\}\/\$\{planLink\.quoteId\}`\}/, 'the banner links to the quote page')
  const banner = source.indexOf('<PlanBanner invoiceId={invoiceId} />')
  const lines = source.indexOf('<InvoiceLines invoiceId={invoiceId} />')
  assert.ok(banner > -1 && lines > banner, 'the banner is above the lines')
  assert.match(source, /if \(!bundle \|\| !planLink \|\| !isFirstPlanDraft\(planLink\.kind, String\(bundle\.record\.status\)\)\) return null/, 'only the first invoice of a plan, while a Draft')
})

test('the new files are plain ASCII and the modified lines add no invisible characters', () => {
  for (const [name, parts] of NEW_FILES) {
    assert.doesNotMatch(read(...parts), /[^\n -~]/, `${name} is plain ASCII (use \\u escapes)`)
  }
  for (const source of [quotePage(), invoicePage(), documentActions()]) {
    assert.deepEqual([...source].filter((ch) => isInvisible(ch.codePointAt(0) ?? 0)), [], 'no zero-width or bidi characters')
  }
})
