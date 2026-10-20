import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import * as copy from '../../features/quote-portal/copy.ts'
import { normaliseDecisionInput, refusalMessage } from '../../features/quote-portal/decision.ts'
import { consentTextFor, decisionPayload, flowReducer, initialFlowState, type FlowAction, type FlowState } from '../../features/quote-portal/decision-flow.ts'
import { buildPortalQuoteModel } from '../../features/quote-portal/portal-view-model.ts'
import { DECLINE_REASONS, type PortalLine, type PortalQuoteFull, type PortalRecord } from '../../lib/quote-portal/types.ts'
import { installComponentLoader } from './support/component-loader.ts'

// Quote portal, slice 2, task 9: the client accepts or declines on the portal page.
//
// The steps of the flow are a pure reducer (features/quote-portal/decision-flow.ts) and are run here action by action.
// The view model's new fields are run too. The two components are rendered to static HTML with react-dom/server
// (tests/unit/support/component-loader.ts compiles their JSX; next/navigation and the server actions, which cannot load
// outside Next, are stubbed), so what is asserted about buttons, labels and ARIA is the real markup. What a render
// cannot show (a click, focus, router.refresh) is guarded by the source.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

// 43 base64url characters: the shape of a real link token. Not a real token.
const TOKEN = 'A'.repeat(20) + '-_' + 'b'.repeat(21)
const HASH = 'ab12'.repeat(16)
const MASKED = 'c***@example.test'

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------

let counter = 0
const line = (overrides: Partial<PortalLine> & Pick<PortalLine, 'line_amount'>): PortalLine => {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    position: counter,
    title: `Line ${counter}`,
    description: null,
    quantity: 1,
    unit_price: overrides.line_amount,
    vat_code: 'standard',
    charge_kind: null,
    ...overrides,
  }
}

const record = (overrides: Partial<PortalRecord> = {}): PortalRecord => ({
  quote_number: 'HMK-Q-2026-00001',
  status: 'Sent',
  issue_date: '2026-10-18',
  valid_until: '2026-10-25',
  currency: 'ZAR',
  client_name: 'TEST Company',
  contact_name: null,
  client_ref: null,
  project_name: 'Signature Partner',
  project_description: 'HIMARK will provide strategic growth consulting services.',
  project_ref: null,
  vat_rate: '15.00',
  subtotal: '200000.00',
  tax_amount: '30000.00',
  total_amount: '230000.00',
  terms: '1. Payment is due within 30 days.\n2. Prices exclude travel.',
  service_inclusions: 'Strategic advisory and planning',
  terms_sources: [{ layer: 'company', version: 3 }],
  bill_to: { name: 'TEST Company' },
  issuer: { legal_name: 'HIMARK Strategic Growth Consulting', email: 'info@himark.co.za' },
  sent_at: '2026-10-18T09:00:00+00:00',
  accepted_at: null,
  ...overrides,
})

const GROUPED: PortalLine[] = [
  line({ title: 'Monthly Retainer', description: 'Includes 40 credits a month', line_amount: '100000.00', charge_kind: 'monthly' }),
  line({ title: 'Implementation Fee', line_amount: '100000.00', charge_kind: 'once_off' }),
]

const full = (overrides: Partial<PortalQuoteFull> = {}, recordOverrides: Partial<PortalRecord> = {}, lines: PortalLine[] = GROUPED): PortalQuoteFull => ({
  state: 'open',
  expires_at: '2026-10-25T22:00:00+00:00',
  recipient_email: 'client@example.test',
  recipient_name: 'A. Client',
  record: record(recordOverrides),
  lines,
  version: 1,
  replaces_number: null,
  owner: { name: 'Neo Matime', email: 'neo@himark.co.za', job_title: 'Founder' },
  snapshot_hash: HASH,
  response: null,
  ...overrides,
})

// ---------------------------------------------------------------------------------------------------------------
// The flow, action by action
// ---------------------------------------------------------------------------------------------------------------

const PREFILL = { name: 'A. Client', organisation: 'TEST Company' }
const run = (state: FlowState, ...actions: FlowAction[]) => actions.reduce(flowReducer, state)
const edit = (field: Extract<FlowAction, { type: 'edit' }>['field'], value: string): FlowAction => ({ type: 'edit', field, value })
const CODE_SENT: FlowAction = { type: 'code_answer', answer: { ok: true, maskedEmail: MASKED, expiresInMinutes: 10 } }
const refused = (reason: Parameters<typeof refusalMessage>[0] & ('stale' | 'not_open' | 'code_wrong' | 'code_locked' | 'code_expired' | 'throttled'), attemptsLeft?: number): FlowAction => ({
  type: 'decision_answer',
  answer: { ok: false, reason, attemptsLeft, message: refusalMessage(reason, attemptsLeft) },
})

/** The confirm step of a decision with every field valid and the box ticked: ready for "Email me a code". */
const ready = (decision: 'accepted' | 'declined') =>
  run(initialFlowState(PREFILL), { type: 'open', decision }, edit('position', 'Director'), { type: 'consent', checked: true })
/** The code step, a code typed and Confirm pressed: a decision in flight. */
const confirming = (decision: 'accepted' | 'declined' = 'accepted') => run(ready(decision), { type: 'request_code' }, CODE_SENT, edit('code', '204816'), { type: 'submit' })

const DECIDE_KEYS = ['token', 'code', 'decision', 'signatoryName', 'signatoryPosition', 'signatoryOrganisation', 'consentText', 'consent', 'snapshotHash', 'declineReason', 'declineComments']

test('the happy accept: Accept opens the confirm step, a code is emailed, the code confirms and the flow is done', () => {
  const idle = initialFlowState(PREFILL)
  assert.equal(idle.step, 'idle')
  assert.equal(idle.consent, false, 'the consent box starts unticked')
  assert.deepEqual([idle.name, idle.position, idle.organisation], ['A. Client', '', 'TEST Company'], 'the name and organisation are prefilled, the position is not')

  const confirm = flowReducer(idle, { type: 'open', decision: 'accepted' })
  assert.equal(confirm.step, 'confirm')
  assert.equal(confirm.decision, 'accepted')
  assert.equal(confirm.consent, false)

  const requesting = run(confirm, edit('position', 'Managing Director'), { type: 'consent', checked: true }, { type: 'request_code' })
  assert.equal(requesting.pending, 'code')
  assert.equal(requesting.step, 'confirm', 'the step changes once the code has gone, not before')

  const code = flowReducer(requesting, CODE_SENT)
  assert.equal(code.step, 'code')
  assert.equal(code.pending, null)
  assert.equal(code.message, copy.codeSentMessage(MASKED, 10))

  const deciding = run(code, edit('code', '204816'), { type: 'submit' })
  assert.equal(deciding.pending, 'decision')

  // What goes to decideAction: exactly the DecideInput keys, and a form the server's own rules accept.
  const payload = decisionPayload(deciding, TOKEN, HASH)
  assert.deepEqual(Object.keys(payload).sort(), [...DECIDE_KEYS].sort())
  assert.deepEqual(payload, {
    token: TOKEN,
    code: '204816',
    decision: 'accepted',
    signatoryName: 'A. Client',
    signatoryPosition: 'Managing Director',
    signatoryOrganisation: 'TEST Company',
    consentText: copy.CONSENT_ACCEPT,
    consent: true,
    snapshotHash: HASH,
    declineReason: null,
    declineComments: null,
  })
  assert.equal(normaliseDecisionInput(payload).ok, true)

  const done = flowReducer(deciding, { type: 'decision_answer', answer: { ok: true, decision: 'accepted', replay: false } })
  assert.equal(done.step, 'done')
  assert.equal(done.pending, null)
  assert.equal(done.message, copy.DECISION_RECORDED)
  // A replay (the same decision already recorded, from a second tab) is done too.
  assert.equal(flowReducer(deciding, { type: 'decision_answer', answer: { ok: true, decision: 'accepted', replay: true } }).step, 'done')
})

test('the happy decline: a reason and comments are optional, and the decline wording goes with it', () => {
  assert.equal(consentTextFor('declined'), copy.CONSENT_DECLINE)
  assert.equal(consentTextFor('accepted'), copy.CONSENT_ACCEPT)

  const bare = run(ready('declined'), { type: 'request_code' })
  assert.equal(bare.pending, 'code', 'a decline with no reason and no comments may ask for a code')
  assert.deepEqual(bare.errors, {})
  const payload = decisionPayload(run(bare, CODE_SENT, edit('code', '204816'), { type: 'submit' }), TOKEN, HASH)
  assert.equal(payload.decision, 'declined')
  assert.equal(payload.consentText, copy.CONSENT_DECLINE)
  assert.equal(payload.declineReason, null, 'no reason is null, not an empty string')
  assert.equal(payload.declineComments, null)
  assert.equal(normaliseDecisionInput(payload).ok, true)

  const reasoned = run(ready('declined'), edit('declineReason', 'Timing is not right'), edit('declineComments', 'Next year, perhaps.'), { type: 'request_code' }, CODE_SENT, edit('code', '204816'), { type: 'submit' })
  const withReason = decisionPayload(reasoned, TOKEN, HASH)
  assert.equal(withReason.declineReason, 'Timing is not right')
  assert.equal(withReason.declineComments, 'Next year, perhaps.')
  assert.equal(normaliseDecisionInput(withReason).ok, true)

  const done = flowReducer(reasoned, { type: 'decision_answer', answer: { ok: true, decision: 'declined', replay: false } })
  assert.equal(done.step, 'done')
})

test('"Email me a code" waits for the three fields and the ticked box, and puts each error beside its field', () => {
  const blank = flowReducer(initialFlowState({ name: '', organisation: '' }), { type: 'open', decision: 'accepted' })
  const refusedBlank = flowReducer(blank, { type: 'request_code' })
  assert.equal(refusedBlank.pending, null, 'no code is asked for')
  assert.equal(refusedBlank.step, 'confirm')
  assert.deepEqual(refusedBlank.errors, {
    name: copy.FIELD_ERRORS.name,
    position: copy.FIELD_ERRORS.position,
    organisation: copy.FIELD_ERRORS.organisation,
    consent: copy.FIELD_ERRORS.consent,
  })
  assert.equal(refusedBlank.message, copy.REFUSAL_MESSAGES.incomplete)

  // Fixing a field takes its error away at once; the others stay until the next try.
  const ticked = flowReducer(refusedBlank, { type: 'consent', checked: true })
  assert.equal(ticked.errors.consent, undefined)
  assert.equal(ticked.errors.name, copy.FIELD_ERRORS.name)

  // Every field valid but the box not ticked: refused for the consent alone.
  const unticked = run(blank, edit('name', 'Pat Client'), edit('position', 'Director'), edit('organisation', 'Acme'), { type: 'request_code' })
  assert.equal(unticked.pending, null)
  assert.deepEqual(unticked.errors, { consent: copy.FIELD_ERRORS.consent })

  // The server's own rules: a line break in a name is refused, a reason not in the list is refused, and so are 2001
  // characters of comments.
  assert.deepEqual(run(ready('accepted'), edit('name', 'Pat\nBcc: x@y.co'), { type: 'request_code' }).errors, { name: copy.FIELD_ERRORS.name })
  assert.deepEqual(run(ready('declined'), edit('declineReason', 'Too dear'), { type: 'request_code' }).errors, { reason: copy.FIELD_ERRORS.reason })
  assert.deepEqual(run(ready('declined'), edit('declineComments', 'x'.repeat(2001)), { type: 'request_code' }).errors, { comments: copy.FIELD_ERRORS.comments })
})

test('a code request that fails stays where it was asked from, with its message, and keeps what was typed', () => {
  const failed = run(ready('accepted'), { type: 'request_code' }, { type: 'code_answer', answer: { ok: false, message: copy.REFUSAL_MESSAGES.send_failed } })
  assert.equal(failed.step, 'confirm')
  assert.equal(failed.pending, null)
  assert.equal(failed.message, copy.REFUSAL_MESSAGES.send_failed)
  assert.equal(failed.position, 'Director')
  assert.equal(failed.consent, true)

  // "Send a new code" from the code step that fails stays on the code step.
  const again = run(ready('accepted'), { type: 'request_code' }, CODE_SENT, { type: 'request_code' })
  assert.equal(again.pending, 'code')
  const throttled = flowReducer(again, { type: 'code_answer', answer: { ok: false, message: copy.REFUSAL_MESSAGES.throttled } })
  assert.equal(throttled.step, 'code')
  assert.equal(throttled.message, copy.REFUSAL_MESSAGES.throttled)
})

test('a wrong code stays on the code step with the attempts left, twice; then a locked code waits for a new one', () => {
  const code = run(ready('accepted'), { type: 'request_code' }, CODE_SENT)

  const first = run(code, edit('code', '111111'), { type: 'submit' }, refused('code_wrong', 4))
  assert.equal(first.step, 'code')
  assert.equal(first.pending, null)
  assert.equal(first.message, refusalMessage('code_wrong', 4))
  assert.equal(first.needsNewCode, false)

  const second = run(first, edit('code', '222222'), { type: 'submit' }, refused('code_wrong', 3))
  assert.equal(second.step, 'code')
  assert.equal(second.message, refusalMessage('code_wrong', 3))

  const locked = run(second, edit('code', '333333'), { type: 'submit' }, refused('code_locked'))
  assert.equal(locked.step, 'code')
  assert.equal(locked.message, refusalMessage('code_locked'))
  assert.equal(locked.needsNewCode, true)
  assert.equal(flowReducer(locked, { type: 'submit' }), locked, 'Confirm does nothing until a new code is sent')

  const renewed = run(locked, { type: 'request_code' }, CODE_SENT)
  assert.equal(renewed.needsNewCode, false)
  assert.equal(renewed.code, '', 'the old code is cleared')
  assert.equal(run(renewed, edit('code', '444444'), { type: 'submit' }).pending, 'decision')

  // The last attempt used up and an expired code wait for a new code too; a throttle does not spend the code.
  assert.equal(run(code, edit('code', '111111'), { type: 'submit' }, refused('code_wrong', 0)).needsNewCode, true)
  assert.equal(run(code, edit('code', '111111'), { type: 'submit' }, refused('code_expired')).needsNewCode, true)
  assert.equal(run(code, edit('code', '111111'), { type: 'submit' }, refused('throttled')).needsNewCode, false)
})

test('a code that is not six digits is refused beside the field and never sent', () => {
  const code = run(ready('accepted'), { type: 'request_code' }, CODE_SENT)
  for (const typed of ['', '12345', '12 34 56', 'abcdef']) {
    const next = run(code, edit('code', typed), { type: 'submit' })
    assert.equal(next.pending, null, JSON.stringify(typed))
    assert.deepEqual(next.errors, { code: copy.FIELD_ERRORS.code })
  }
  assert.equal(run(code, edit('code', ' 204816 '), { type: 'submit' }).pending, 'decision', 'spaces at the ends are trimmed, as on the server')
})

test('a stale page or a quote no longer open ends in the refresh state, from which the client can start again', () => {
  for (const reason of ['stale', 'not_open'] as const) {
    const ended = flowReducer(confirming(), refused(reason))
    assert.equal(ended.step, 'refresh', reason)
    assert.equal(ended.pending, null)
    assert.equal(ended.message, refusalMessage(reason))
    const again = flowReducer(ended, { type: 'open', decision: 'declined' })
    assert.equal(again.step, 'confirm', 'Accept or Decline can be pressed again on the refreshed page')
    assert.equal(again.consent, false)
    assert.equal(again.message, null)
  }
})

test('field errors from the server go back to the confirm step, each beside its field', () => {
  const answer: FlowAction = {
    type: 'decision_answer',
    answer: { ok: false, message: copy.REFUSAL_MESSAGES.incomplete, errors: { name: copy.FIELD_ERRORS.name, snapshot: copy.FIELD_ERRORS.snapshot } },
  }
  const back = flowReducer(confirming(), answer)
  assert.equal(back.step, 'confirm')
  assert.deepEqual(back.errors, { name: copy.FIELD_ERRORS.name })
  assert.equal(back.message, copy.REFUSAL_MESSAGES.incomplete)
})

test('a second press while a request is pending changes nothing: the very same state comes back', () => {
  const deciding = confirming()
  for (const action of [{ type: 'submit' }, { type: 'request_code' }, { type: 'back' }, edit('code', '999999'), { type: 'open', decision: 'declined' }] as FlowAction[]) {
    assert.equal(flowReducer(deciding, action), deciding, `decision pending: ${JSON.stringify(action)}`)
  }
  const requesting = run(ready('accepted'), { type: 'request_code' })
  for (const action of [{ type: 'request_code' }, { type: 'back' }, edit('name', 'Someone Else'), { type: 'consent', checked: false }] as FlowAction[]) {
    assert.equal(flowReducer(requesting, action), requesting, `code pending: ${JSON.stringify(action)}`)
  }
  // An answer that arrives when nothing is pending (a late reply) is ignored.
  const idle = initialFlowState(PREFILL)
  assert.equal(flowReducer(idle, CODE_SENT), idle)
  assert.equal(flowReducer(idle, { type: 'decision_answer', answer: { ok: true, decision: 'accepted', replay: false } }), idle)
  assert.equal(flowReducer(requesting, { type: 'decision_answer', answer: { ok: true, decision: 'accepted', replay: false } }), requesting)
})

test('Back steps back, the consent is never carried to another decision, and an accept never sends decline details', () => {
  const declined = run(ready('declined'), edit('declineReason', 'Other'), edit('declineComments', 'Some thoughts.'))
  const idle = flowReducer(declined, { type: 'back' })
  assert.equal(idle.step, 'idle')
  const accept = flowReducer(idle, { type: 'open', decision: 'accepted' })
  assert.equal(accept.consent, false, 'the box is unticked again for the other decision')
  assert.equal(accept.position, 'Director', 'what was typed is kept')

  const payload = decisionPayload(run(accept, { type: 'consent', checked: true }, { type: 'request_code' }, CODE_SENT, edit('code', '204816'), { type: 'submit' }), TOKEN, HASH)
  assert.equal(payload.consentText, copy.CONSENT_ACCEPT)
  assert.equal(payload.declineReason, null)
  assert.equal(payload.declineComments, null)
  assert.equal(normaliseDecisionInput(payload).ok, true, 'the server refuses decline details on an accept')

  const code = run(ready('accepted'), { type: 'request_code' }, CODE_SENT, edit('code', '12'))
  const back = flowReducer(code, { type: 'back' })
  assert.equal(back.step, 'confirm')
  assert.equal(back.consent, true)
  assert.equal(back.code, '')
  assert.equal(flowReducer(initialFlowState(PREFILL), { type: 'back' }).step, 'idle')
})

// ---------------------------------------------------------------------------------------------------------------
// The view model's new fields
// ---------------------------------------------------------------------------------------------------------------

test('the model of an open quote carries the snapshot hash, the recipient, no response and the confirmation', () => {
  const model = buildPortalQuoteModel(full())
  assert.equal(model.respondable, true)
  assert.equal(model.alreadyResponded, false)
  assert.equal(model.snapshotHash, HASH)
  assert.equal(model.recipientEmail, 'client@example.test')
  assert.equal(model.response, null)
  assert.deepEqual(model.confirmation, {
    numberAndVersion: 'HMK-Q-2026-00001 (Version 1)',
    organisation: 'TEST Company',
    services: ['Monthly Retainer'],
    initialTotal: 'ZAR 230,000.00',
    recurring: 'ZAR 115,000.00 per month',
    keyTerms: ['Payment is due within 30 days.', 'Prices exclude travel.'],
    prefill: { name: 'A. Client', organisation: 'TEST Company' },
  })
})

test('a link that already carries a response is not offered one again, and its decision date is the South African day', () => {
  // A reopened quote: open again, but this link decided before. The answer's time may come in any zone.
  const reopened = buildPortalQuoteModel(full({ response: { decision: 'declined', decided_at: '2026-10-20T00:30:00+02:00' } }))
  assert.equal(reopened.respondable, false)
  assert.equal(reopened.alreadyResponded, true)
  assert.deepEqual(reopened.response, { decision: 'declined', decidedOn: '20 October 2026' })
  assert.equal(reopened.banner, null, 'an open quote still has no banner')

  // The same instant written in UTC is the same day; a time that cannot be read has no date.
  assert.equal(buildPortalQuoteModel(full({ response: { decision: 'accepted', decided_at: '2026-10-19T22:30:00+00:00' } })).response?.decidedOn, '20 October 2026')
  assert.equal(buildPortalQuoteModel(full({ response: { decision: 'accepted', decided_at: 'not a time' } })).response?.decidedOn, null)

  // A quote this link declined: decided, not offered a response, and not "already responded" (the banner says it all).
  const declined = buildPortalQuoteModel(full({ state: 'declined', response: { decision: 'declined', decided_at: '2026-10-20T08:00:00+00:00' } }, { status: 'Declined' }))
  assert.equal(declined.respondable, false)
  assert.equal(declined.alreadyResponded, false)
  assert.equal(declined.response?.decision, 'declined')
  // A decided quote with no response from this link (marked by staff, or decided from another link).
  const accepted = buildPortalQuoteModel(full({ state: 'accepted' }, { status: 'Accepted' }))
  assert.equal(accepted.respondable, false)
  assert.equal(accepted.alreadyResponded, false)
  assert.equal(accepted.response, null)
})

test('the confirmation of a grouped and of a flat quote', () => {
  // Grouped, a replacing version, monthly lines that are zero-rated: the monthly figure is the subtotal, per month.
  const grouped = buildPortalQuoteModel(full({ version: 2, replaces_number: 'HMK-Q-2026-00000' }, { subtotal: '150.00', tax_amount: '7.50', total_amount: '157.50' }, [
    line({ title: 'Hosting', line_amount: '100.00', vat_code: 'zero', charge_kind: 'monthly' }),
    line({ title: 'Set-up', line_amount: '50.00', charge_kind: 'once_off' }),
  ])).confirmation
  assert.equal(grouped.numberAndVersion, 'HMK-Q-2026-00001 (Version 2, replacing HMK-Q-2026-00000)')
  assert.equal(grouped.initialTotal, 'ZAR 157.50', 'the stored total, as the page prints totals')
  assert.equal(grouped.recurring, 'ZAR 100.00 per month')
  assert.deepEqual(grouped.services, ['Hosting', 'Set-up'], 'with no line descriptions, the services are the line titles')

  // Flat (a line with no kind): nothing recurs. Four terms: the key terms are the first three.
  const flat = buildPortalQuoteModel(full({ recipient_name: null }, {
    subtotal: '150.00', tax_amount: '22.50', total_amount: '172.50', terms: '1. One.\n2. Two.\n3. Three.\n4. Four.',
  }, [line({ title: 'Advisory', description: 'Two workshops', line_amount: '100.00' }), line({ title: 'Workshop', line_amount: '50.00', charge_kind: 'monthly' })])).confirmation
  assert.equal(flat.recurring, null)
  assert.equal(flat.initialTotal, 'ZAR 172.50')
  assert.deepEqual(flat.keyTerms, ['One.', 'Two.', 'Three.'])
  assert.deepEqual(flat.services, ['Advisory'], 'the scope services, when the quote has them')
  assert.deepEqual(flat.prefill, { name: '', organisation: 'TEST Company' }, 'no recipient name: the name is left for the client to type')
})

// ---------------------------------------------------------------------------------------------------------------
// The components, rendered
// ---------------------------------------------------------------------------------------------------------------

installComponentLoader({
  'next/navigation': 'export function useRouter() { return { refresh() {} } }',
  '../actions/request-code': "export async function requestCodeAction() { throw new Error('no server in a unit test') }",
  '../actions/decide': "export async function decideAction() { throw new Error('no server in a unit test') }",
})
const { PortalDecisionFlow } = await import('../../features/quote-portal/components/portal-decision-flow.tsx')
const { CodeStep, ConfirmStep } = await import('../../features/quote-portal/components/portal-decision-steps.tsx')

const CONFIRMATION = buildPortalQuoteModel(full()).confirmation
const noop = () => {}
const tags = (html: string, name: string): string[] => [...(html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [])]
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1] ?? null
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|/?>)`, 'i').test(tag)
/** The text of the element with this id. */
const textOf = (html: string, id: string) => html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] ?? null
/** The text of the label for this id. */
const labelFor = (html: string, id: string) => html.match(new RegExp(`<label[^>]*for="${id}"[^>]*>([^<]*)<`))?.[1] ?? null

const renderConfirm = (state: FlowState) =>
  renderToStaticMarkup(
    createElement(ConfirmStep, {
      state, confirmation: CONFIRMATION, verifiedEmail: MASKED, idBase: 'flow', headingRef: { current: null },
      onEdit: noop, onConsent: noop, onRequestCode: noop, onBack: noop,
    }),
  )
const renderCode = (state: FlowState) =>
  renderToStaticMarkup(
    createElement(CodeStep, { state, idBase: 'flow', headingRef: { current: null }, onEdit: noop, onConfirm: noop, onRequestCode: noop, onBack: noop }),
  )

test('the panel opens with Accept and Decline as buttons of type button, a polite live region, and nothing to type', () => {
  const html = renderToStaticMarkup(createElement(PortalDecisionFlow, { token: TOKEN, snapshotHash: HASH, verifiedEmail: MASKED, confirmation: CONFIRMATION }))
  const buttons = tags(html, 'button')
  assert.equal(buttons.length, 2)
  for (const button of buttons) assert.equal(attr(button, 'type'), 'button')
  assert.match(html, new RegExp(`<button[^>]*>.*?${copy.ACCEPT_QUOTATION}.*?</button>`))
  assert.match(html, new RegExp(`<button[^>]*>.*?${copy.DECLINE_QUOTATION}.*?</button>`))
  assert.ok(html.indexOf(copy.ACCEPT_QUOTATION) < html.indexOf(copy.DECLINE_QUOTATION), 'Accept comes first')
  assert.equal(tags(html, 'a').length, 0, 'no link')
  assert.equal(tags(html, 'form').length + tags(html, 'input').length, 0, 'no form and no field before a decision is chosen')
  const live = tags(html, 'div').filter((tag) => attr(tag, 'aria-live') === 'polite')
  assert.equal(live.length, 1, 'one polite live region')
  assert.equal(attr(live[0], 'role'), 'status')
  assert.ok(!hasAttr(html, 'data-decision-form'), 'the panel is not a form yet, so it may stay sticky')
  assert.ok(!html.includes(TOKEN) && !html.includes(HASH), 'neither the token nor the hash is printed')
})

test('the confirm step shows the summary, labelled fields prefilled, the email as text and the consent box unticked', () => {
  const state = flowReducer(initialFlowState(PREFILL), { type: 'open', decision: 'accepted' })
  const html = renderConfirm(state)

  const heading = tags(html, 'h3')[0]
  assert.equal(attr(heading, 'tabindex'), '-1', 'the heading can take focus')
  assert.match(html, new RegExp(`<h3[^>]*>${copy.STEP_LABELS.confirmAccept}</h3>`))
  for (const value of [CONFIRMATION.numberAndVersion, CONFIRMATION.organisation, 'Monthly Retainer', 'ZAR 230,000.00', 'ZAR 115,000.00 per month', ...CONFIRMATION.keyTerms]) {
    assert.ok(html.includes(value), value)
  }
  for (const label of Object.values(copy.CONFIRMATION_LABELS)) assert.ok(html.includes(label), label)

  const inputs = tags(html, 'input')
  const text = inputs.filter((tag) => attr(tag, 'type') === 'text')
  assert.deepEqual(text.map((tag) => attr(tag, 'value')), ['A. Client', '', 'TEST Company'], 'name, position and organisation, prefilled')
  assert.deepEqual(text.map((tag) => labelFor(html, attr(tag, 'id') ?? '')), [copy.FORM_LABELS.name, copy.FORM_LABELS.position, copy.FORM_LABELS.organisation])

  const checkbox = inputs.filter((tag) => attr(tag, 'type') === 'checkbox')
  assert.equal(checkbox.length, 1)
  assert.ok(!hasAttr(checkbox[0], 'checked'), 'the consent box is not ticked')
  assert.equal(labelFor(html, attr(checkbox[0], 'id') ?? ''), copy.CONSENT_ACCEPT, 'the exact consent wording is its label')

  // The verified email is text, and no field holds or asks for an address.
  assert.ok(html.includes(MASKED))
  assert.equal(inputs.length, 4, 'three text fields and the box')
  for (const tag of inputs) assert.doesNotMatch(tag, /email|@/i)
  assert.equal(tags(html, 'select').length + tags(html, 'textarea').length, 0, 'no decline fields on an accept')

  const buttons = tags(html, 'button')
  for (const button of buttons) assert.equal(attr(button, 'type'), 'button')
  assert.match(html, new RegExp(`<button[^>]*>${copy.FLOW_BUTTONS.emailCode}</button>`))
  assert.match(html, new RegExp(`<button[^>]*>${copy.FLOW_BUTTONS.back}</button>`))
  assert.ok(buttons.every((button) => !hasAttr(button, 'disabled')))
})

test('the decline step adds the six reasons with an empty choice, and an optional comments box', () => {
  const html = renderConfirm(flowReducer(initialFlowState(PREFILL), { type: 'open', decision: 'declined' }))
  assert.match(html, new RegExp(`<h3[^>]*>${copy.STEP_LABELS.confirmDecline}</h3>`))
  const select = tags(html, 'select')
  assert.equal(select.length, 1)
  assert.equal(labelFor(html, attr(select[0], 'id') ?? ''), copy.FORM_LABELS.reason)
  const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((match) => [match[1], match[2]])
  assert.deepEqual(options, [['', copy.FORM_LABELS.noReason], ...DECLINE_REASONS.map((reason) => [reason, reason])])
  const textarea = tags(html, 'textarea')
  assert.equal(textarea.length, 1)
  assert.equal(labelFor(html, attr(textarea[0], 'id') ?? ''), copy.FORM_LABELS.comments)
  const checkbox = tags(html, 'input').filter((tag) => attr(tag, 'type') === 'checkbox')
  assert.equal(labelFor(html, attr(checkbox[0], 'id') ?? ''), copy.CONSENT_DECLINE)
})

test('a refused field is marked invalid and described by its own error; a pending request disables the buttons', () => {
  const state = flowReducer(flowReducer(initialFlowState({ name: '', organisation: 'TEST Company' }), { type: 'open', decision: 'accepted' }), { type: 'request_code' })
  const html = renderConfirm(state)
  const invalid = tags(html, 'input').filter((tag) => attr(tag, 'aria-invalid') === 'true')
  assert.equal(invalid.length, 3, 'the name, the position and the box')
  for (const tag of invalid) {
    const described = attr(tag, 'aria-describedby')
    assert.ok(described, 'an invalid field points to its error')
    assert.ok(Object.values(copy.FIELD_ERRORS).includes(textOf(html, described!) as never), `${described} holds a field error`)
  }
  const valid = tags(html, 'input').filter((tag) => attr(tag, 'aria-invalid') !== 'true')
  for (const tag of valid) assert.equal(attr(tag, 'aria-describedby'), null, 'a valid field points to no error')

  const pending = renderConfirm(run(ready('accepted'), { type: 'request_code' }))
  const buttons = tags(pending, 'button')
  assert.ok(buttons.length >= 2 && buttons.every((button) => hasAttr(button, 'disabled')), 'no button can be pressed while the code is requested')
  assert.match(pending, new RegExp(`<button[^>]*>${copy.FLOW_BUTTONS.sending}</button>`))
})

test('the code step has one numeric one-time-code field of six, Confirm, Send a new code and Back', () => {
  const state = run(ready('accepted'), { type: 'request_code' }, CODE_SENT)
  const html = renderCode(state)
  assert.match(html, new RegExp(`<h3[^>]*tabindex="-1"[^>]*>${copy.STEP_LABELS.code}</h3>`, 'i'))
  const inputs = tags(html, 'input')
  assert.equal(inputs.length, 1)
  const field = inputs[0]
  assert.equal(attr(field, 'inputmode'), 'numeric')
  assert.equal(attr(field, 'autocomplete'), 'one-time-code')
  assert.equal(attr(field, 'maxlength'), '6')
  assert.equal(labelFor(html, attr(field, 'id') ?? ''), copy.FORM_LABELS.code)
  const buttons = tags(html, 'button')
  assert.equal(buttons.length, 3)
  for (const button of buttons) assert.equal(attr(button, 'type'), 'button')
  for (const label of [copy.FLOW_BUTTONS.confirm, copy.FLOW_BUTTONS.newCode, copy.FLOW_BUTTONS.back]) {
    assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label)
  }

  // A locked code: Confirm is disabled until a new code is sent; asking for one is not.
  const locked = renderCode(run(state, edit('code', '111111'), { type: 'submit' }, refused('code_locked')))
  const [confirm, newCode] = tags(locked, 'button')
  assert.ok(hasAttr(confirm, 'disabled'))
  assert.ok(!hasAttr(newCode, 'disabled'))

  const wrongFormat = renderCode(run(state, edit('code', '12'), { type: 'submit' }))
  const code = tags(wrongFormat, 'input')[0]
  assert.equal(attr(code, 'aria-invalid'), 'true')
  assert.equal(textOf(wrongFormat, attr(code, 'aria-describedby') ?? ''), copy.FIELD_ERRORS.code)
})

// ---------------------------------------------------------------------------------------------------------------
// Source guards: what a static render cannot show
// ---------------------------------------------------------------------------------------------------------------

const FLOW = ['features', 'quote-portal', 'components', 'portal-decision-flow.tsx'] as const
const STEPS = ['features', 'quote-portal', 'components', 'portal-decision-steps.tsx'] as const

test('no link carries Accept or Decline, every button is type="button", and there is no form to submit', () => {
  for (const file of [FLOW, STEPS]) {
    const source = read(...file)
    for (const anchor of source.match(/<a\b[\s\S]*?<\/a>/g) ?? []) {
      assert.doesNotMatch(anchor, /ACCEPT_QUOTATION|DECLINE_QUOTATION|Accept Quotation|Decline Quotation/, file.join('/'))
    }
    assert.doesNotMatch(source, /<Link\b|next\/link|href=/, `${file.join('/')} links nowhere`)
    assert.doesNotMatch(source, /<form\b|type="submit"|formAction/, `${file.join('/')} has no form: nothing can be submitted before the page has loaded`)
    const opened = (source.match(/<button\b/g) ?? []).length
    const typed = (source.match(/<button\b(?:(?!<\/?button\b)[\s\S])*?\stype="button"/g) ?? []).length
    assert.equal(typed, opened, `${file.join('/')}: every button is type="button"`)
  }
  assert.match(read(...STEPS), /\{ACCEPT_QUOTATION\}/)
  assert.match(read(...STEPS), /\{DECLINE_QUOTATION\}/)
})

test('the consent box is controlled by the flow state and never checked by default', () => {
  for (const file of [FLOW, STEPS]) assert.doesNotMatch(read(...file), /defaultChecked|checked=\{true\}/, file.join('/'))
  assert.match(read(...STEPS), /type="checkbox"[\s\S]*?checked=\{state\.consent\}/)
  assert.equal(initialFlowState(PREFILL).consent, false)
  assert.equal(run(ready('accepted'), { type: 'back' }, { type: 'open', decision: 'accepted' }).consent, false, 'it is unticked whenever a decision is opened')
})

test('there is no field for the email: the verified address is printed, never typed', () => {
  for (const file of [FLOW, STEPS]) {
    const source = read(...file)
    for (const input of source.match(/<input\b[\s\S]*?\/>/g) ?? []) assert.doesNotMatch(input, /email/i, file.join('/'))
    assert.doesNotMatch(source, /type="email"/)
  }
  assert.match(read(...STEPS), /\{verifiedEmail\}/)
})

test('the flow is a client component that calls the two actions from ../actions/, and refreshes the page when it ends', () => {
  const flow = read(...FLOW)
  assert.match(flow, /^\s*(\/\/[^\n]*\n\s*)*'use client'/, 'the directive comes first')
  assert.match(flow, /import \{ requestCodeAction \} from '\.\.\/actions\/request-code'/)
  assert.match(flow, /import \{ decideAction \} from '\.\.\/actions\/decide'/)
  assert.equal((flow.match(/requestCodeAction\(/g) ?? []).length, 1, 'one place asks for a code')
  assert.equal((flow.match(/decideAction\(/g) ?? []).length, 1, 'one place sends the decision')
  assert.match(flow, /decideAction\(decisionPayload\(/, 'the decision is the payload built by the pure module')
  assert.match(flow, /router\.refresh\(\)/)
  assert.match(flow, /useRouter\(\)/)
  assert.match(flow, /from 'next\/navigation'/)
  // Every request goes through the reducer first, which ignores a second press while one is pending.
  assert.match(flow, /flowReducer\(/)
  assert.doesNotMatch(read(...STEPS), /actions\/|useRouter|'use client'/, 'the steps only lay out what they are given')
})

test('no file of the portal sets inner HTML, and the flow module is pure', () => {
  for (const file of [FLOW, STEPS]) assert.doesNotMatch(read(...file), /dangerouslySetInnerHTML|innerHTML/, file.join('/'))
  const flowModule = read('features', 'quote-portal', 'decision-flow.ts')
  assert.doesNotMatch(flowModule, /from ['"]@\//, 'relative imports only')
  assert.doesNotMatch(flowModule, /server-only|['"]use (server|client)['"]/, 'no directive')
  assert.doesNotMatch(flowModule, /actions\/|react|next\//, 'no actions, no React, no Next')
})

test('the slice 1 note on how to respond is gone, from the copy and from every portal file', () => {
  assert.equal(Object.hasOwn(copy, 'SLICE_ONE_RESPOND_NOTE'), false)
  const files = [...walk(join(process.cwd(), 'features', 'quote-portal')), ...walk(join(process.cwd(), 'app', '(portal)'))]
  assert.ok(files.length >= 8)
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /SLICE_ONE_RESPOND_NOTE|reply to the email you received/, file)
})

test('the portal page still only reads: it imports neither action nor any write function', () => {
  const page = read('app', '(portal)', 'q', '[token]', 'page.tsx')
  assert.doesNotMatch(page, /requestCodeAction|decideAction|issuePortalCode|submitPortalDecision|actions\/(request-code|decide)|PortalDecisionFlow/)
})
