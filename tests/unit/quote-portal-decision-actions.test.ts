import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { readEvidence } from '../../features/quote-portal/evidence.ts'
import { readDecideAnswer, readIssueCodeAnswer } from '../../lib/quote-portal/decision-answers.ts'

// Quote portal, slice 2, task 8: the two server actions that ask for a confirmation code and send a decision, the
// emails that follow a decision, and the two portal-client calls behind them.
//
// What can be loaded by node --test is tested by behaviour: the reading of the two database answers
// (lib/quote-portal/decision-answers.ts) and the evidence taken from the request headers (features/quote-portal/
// evidence.ts). The portal client, the actions and the email module cannot be loaded (server-only, the @/ alias, a
// directive, next/headers), so, as in the slice 1 tests, they are guarded by what their source says. No test here
// reaches a database.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const requestCodeSource = () => read('features', 'quote-portal', 'actions', 'request-code.ts')
const decideSource = () => read('features', 'quote-portal', 'actions', 'decide.ts')
const emailsSource = () => read('features', 'quote-portal', 'send-decision-emails.ts')
const portalClientSource = () => read('lib', 'quote-portal', 'portal-client.ts')

const count = (source: string, needle: string) => source.split(needle).length - 1

/** The text of one exported function, up to the next top-level export (or the end of the file). */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > -1, `${name} is exported as an async function`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

/** The text of a function that is not exported, up to the next top-level function or export. */
function privateBodyOf(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start > -1, `${name} is defined`)
  const next = source.slice(start + 1).search(/\n(export |async function |function )/)
  return source.slice(start, next === -1 ? undefined : start + 1 + next)
}

/** Every console call, one per line, with its string literals emptied: what is left is what the line prints of its own. */
function logLines(source: string): string[] {
  return (source.match(/console\.\w+\([^\n]*/g) ?? []).map((call) => call.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``'))
}

/** A 'use server' file: the directive first, and nothing exported but async functions. */
function assertServerActionFile(source: string, name: string) {
  assert.match(source, /^\s*(\/\/[^\n]*\n\s*)*'use server'/, `${name}: the directive comes first`)
  const exported = [...source.matchAll(/^export\s+(.*)$/gm)].map((match) => match[1])
  assert.ok(exported.length > 0, `${name} exports its action`)
  for (const statement of exported) assert.ok(statement.startsWith('async function '), `${name}: a use-server file exports only async functions: ${statement}`)
}

// A code, an address and a signatory that must never surface in an error message.
const CODE = '204816'
const ADDRESS = 'jane.client@acme.example'
const SIGNATORY = 'Pat Signatory'

// ---------------------------------------------------------------------------------------------------------------
// The code answer (behaviour)
// ---------------------------------------------------------------------------------------------------------------

const issued = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  code: CODE,
  expires_at: '2026-10-20T10:10:00+00:00',
  recipient_email: ADDRESS,
  quote_number: 'HMK-Q-2026-00042',
  client_name: 'Acme (Pty) Ltd',
  ...overrides,
})

test('a code answer is turned into camel case, key for key', () => {
  assert.deepEqual(readIssueCodeAnswer(issued()), {
    ok: true,
    code: CODE,
    expiresAt: '2026-10-20T10:10:00+00:00',
    recipientEmail: ADDRESS,
    quoteNumber: 'HMK-Q-2026-00042',
    clientName: 'Acme (Pty) Ltd',
  })
  // client_name comes from the record with ->>, so a missing one is null.
  assert.equal((readIssueCodeAnswer(issued({ client_name: null })) as { clientName: unknown }).clientName, null)
})

test('each refusal of portal_issue_code is passed on by its reason alone', () => {
  for (const reason of ['invalid', 'not_open', 'already_decided', 'throttled']) {
    assert.deepEqual(readIssueCodeAnswer({ ok: false, reason }), { ok: false, reason })
  }
})

test('a code answer outside the documented shapes throws, and the error repeats nothing of it', () => {
  const broken: unknown[] = [
    null,
    undefined,
    'ok',
    42,
    [issued()],
    {},
    { ok: 'true' },
    { ok: false },
    { ok: false, reason: 'something_new' },
    { ok: false, reason: 'code_wrong' },
    issued({ code: '12345' }),
    issued({ code: '1234567' }),
    issued({ code: 204816 }),
    issued({ code: '20481a' }),
    issued({ expires_at: null }),
    issued({ recipient_email: null }),
    issued({ recipient_email: '' }),
    issued({ quote_number: null }),
    issued({ client_name: 42 }),
  ]
  for (const answer of broken) {
    assert.throws(
      () => readIssueCodeAnswer(answer),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, 'portal_issue_code returned an unexpected answer')
        return true
      },
      JSON.stringify(answer),
    )
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The decision answer (behaviour)
// ---------------------------------------------------------------------------------------------------------------

const decided = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  replay: false,
  decision: 'accepted',
  decided_at: '2026-10-20T09:15:00.123456+00:00',
  quote_id: '6b0f8a1e-3a1d-4f8e-9a51-2a7c1d0e4b11',
  quote_number: 'HMK-Q-2026-00042',
  client_name: 'Acme (Pty) Ltd',
  recipient_email: ADDRESS,
  signatory_name: SIGNATORY,
  signatory_position: 'Managing Director',
  decline_reason: null,
  decline_comments: null,
  owner_name: 'Olive Owner',
  notify_email: 'olive@himark.example',
  ...overrides,
})

test('a decision answer is the outcome in camel case, with replay beside it', () => {
  assert.deepEqual(readDecideAnswer(decided()), {
    ok: true,
    replay: false,
    outcome: {
      decision: 'accepted',
      decidedAt: '2026-10-20T09:15:00.123456+00:00',
      quoteId: '6b0f8a1e-3a1d-4f8e-9a51-2a7c1d0e4b11',
      quoteNumber: 'HMK-Q-2026-00042',
      clientName: 'Acme (Pty) Ltd',
      recipientEmail: ADDRESS,
      signatoryName: SIGNATORY,
      signatoryPosition: 'Managing Director',
      declineReason: null,
      declineComments: null,
      ownerName: 'Olive Owner',
      notifyEmail: 'olive@himark.example',
    },
  })

  // A repeated request: the outcome recorded the first time, marked as a replay.
  const replayed = readDecideAnswer(
    decided({ replay: true, decision: 'declined', decline_reason: 'Other', decline_comments: 'Line one\nLine two', owner_name: null, notify_email: null }),
  )
  assert.equal(replayed.ok, true)
  if (!replayed.ok) return
  assert.equal(replayed.replay, true)
  assert.equal(replayed.outcome.decision, 'declined')
  assert.equal(replayed.outcome.declineReason, 'Other')
  assert.equal(replayed.outcome.declineComments, 'Line one\nLine two')
  assert.equal(replayed.outcome.ownerName, null, 'a quote with no owner has no name to give')
  assert.equal(replayed.outcome.notifyEmail, null, 'and, with no sender either, no one to tell')
})

test('each refusal of portal_decide is passed on by its reason, and a wrong code carries the attempts left', () => {
  for (const reason of ['invalid', 'not_open', 'incomplete', 'stale', 'code_missing', 'code_expired', 'code_locked', 'throttled']) {
    const refused = readDecideAnswer({ ok: false, reason })
    assert.deepEqual(refused, { ok: false, reason })
    assert.ok(!('attemptsLeft' in refused), `${reason} carries no attempts count`)
  }
  assert.deepEqual(readDecideAnswer({ ok: false, reason: 'code_wrong', attempts_left: 3 }), { ok: false, reason: 'code_wrong', attemptsLeft: 3 })
  assert.deepEqual(readDecideAnswer({ ok: false, reason: 'code_wrong', attempts_left: 0 }), { ok: false, reason: 'code_wrong', attemptsLeft: 0 })
})

test('a decision answer outside the documented shapes throws, and the error repeats nothing of it', () => {
  const broken: unknown[] = [
    null,
    undefined,
    'ok',
    [decided()],
    {},
    { ok: 1 },
    { ok: false },
    { ok: false, reason: 'already_decided' },
    { ok: false, reason: 'something_new' },
    { ok: false, reason: 'code_wrong' },
    { ok: false, reason: 'code_wrong', attempts_left: -1 },
    { ok: false, reason: 'code_wrong', attempts_left: 2.5 },
    { ok: false, reason: 'code_wrong', attempts_left: '3' },
    decided({ replay: undefined }),
    decided({ replay: 'false' }),
    decided({ decision: 'maybe' }),
    decided({ decision: 'Accepted' }),
    decided({ decided_at: null }),
    decided({ quote_id: null }),
    decided({ quote_number: null }),
    decided({ client_name: null }),
    decided({ recipient_email: '' }),
    decided({ signatory_name: null }),
    decided({ signatory_position: 7 }),
    decided({ decline_reason: 5 }),
    decided({ decline_comments: ['x'] }),
    decided({ owner_name: undefined }),
    decided({ notify_email: false }),
  ]
  for (const answer of broken) {
    assert.throws(
      () => readDecideAnswer(answer),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, 'portal_decide returned an unexpected answer')
        return true
      },
      JSON.stringify(answer),
    )
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The evidence (behaviour)
// ---------------------------------------------------------------------------------------------------------------

const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null

test('the address is the first x-forwarded-for entry, else x-real-ip, and only a real IP address', () => {
  assert.equal(readEvidence(from({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })).ip, '203.0.113.7')
  assert.equal(readEvidence(from({ 'x-forwarded-for': '  203.0.113.7  ' })).ip, '203.0.113.7', 'trimmed')
  assert.equal(readEvidence(from({ 'x-forwarded-for': ' 2001:db8::1 , 203.0.113.9' })).ip, '2001:db8::1', 'IPv6 too')
  assert.equal(readEvidence(from({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.2' })).ip, '203.0.113.7', 'x-forwarded-for wins')
  assert.equal(readEvidence(from({ 'x-real-ip': ' 198.51.100.2 ' })).ip, '198.51.100.2', 'x-real-ip when there is no x-forwarded-for')
  assert.equal(readEvidence(from({ 'x-forwarded-for': ' , 203.0.113.9', 'x-real-ip': '198.51.100.2' })).ip, '198.51.100.2', 'an empty first entry is no entry')
  assert.equal(readEvidence(from({})).ip, null, 'no header, no address')

  // Anything that is not an address is dropped, not stored: it is evidence, never a reason to refuse.
  for (const value of ['unknown', '203.0.113.7:5678', '[2001:db8::1]', '[::1]:443', '999.1.1.1', '<script>', 'a'.repeat(100), '203.0.113.7 198.51.100.2']) {
    assert.equal(readEvidence(from({ 'x-forwarded-for': value })).ip, null, value)
    assert.equal(readEvidence(from({ 'x-real-ip': value })).ip, null, value)
  }
  // A first entry that is not an address does not fall through to x-real-ip.
  assert.equal(readEvidence(from({ 'x-forwarded-for': 'unknown, 203.0.113.9', 'x-real-ip': '198.51.100.2' })).ip, null)
})

test('the user agent is kept to 300 characters, cut between characters, or null', () => {
  assert.equal(readEvidence(from({ 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)' })).userAgent, 'Mozilla/5.0 (X11; Linux x86_64)')
  assert.equal(readEvidence(from({ 'user-agent': 'x'.repeat(300) })).userAgent, 'x'.repeat(300))
  assert.equal(readEvidence(from({ 'user-agent': 'y'.repeat(1000) })).userAgent, 'y'.repeat(300))
  assert.equal(readEvidence(from({})).userAgent, null)
  assert.equal(readEvidence(from({ 'user-agent': '' })).userAgent, null)

  // Counted as the database counts (characters, not UTF-16 units), so an emoji at the cut is kept whole, never halved
  // into a lone surrogate that could not be stored.
  const cut = readEvidence(from({ 'user-agent': 'a'.repeat(299) + '\u{1F600}' + 'b'.repeat(10) })).userAgent
  assert.equal(cut, 'a'.repeat(299) + '\u{1F600}')
  assert.equal(Array.from(cut ?? '').length, 300)
  assert.doesNotMatch(cut ?? '', /[\uD800-\uDFFF]/u, 'no lone surrogate')
})

test('the evidence reads only the three headers it names', () => {
  const asked: string[] = []
  readEvidence((name) => {
    asked.push(name)
    return null
  })
  assert.deepEqual([...new Set(asked)].sort(), ['user-agent', 'x-forwarded-for', 'x-real-ip'])
})

// ---------------------------------------------------------------------------------------------------------------
// The portal client (source)
// ---------------------------------------------------------------------------------------------------------------

test('portal-client still holds the service role, and the allowlist of service-role files is unchanged', () => {
  const source = portalClientSource()
  assert.ok(source.startsWith("import 'server-only'"), 'server-only is the first line')
  assert.match(source, /^import \{ createAdminSupabase \} from '@\/lib\/supabase\/admin'$/m)
  assert.match(source, /^import \{ readDecideAnswer, readIssueCodeAnswer \} from '@\/lib\/quote-portal\/decision-answers'$/m)

  const boundary = read('tests', 'unit', 'service-role-boundary.test.ts')
  const pinned = boundary.match(/assert\.deepEqual\(\[\.\.\.SERVICE_ROLE_REQUEST_PATHS\]\.sort\(\), \[([\s\S]*?)\]\)/)?.[1]
  assert.ok(pinned, 'the boundary test pins its allowlist by value')
  assert.deepEqual([...pinned.matchAll(/'([^']+)'/g)].map((match) => match[1]), [
    'app/api/integrations/website-leads/route.ts',
    'features/internal-provisioning/actions/provision-organization.ts',
    'lib/invitations/create-invited-account.ts',
    'lib/quote-portal/portal-client.ts',
  ])
})

test('issuePortalCode checks the token shape before it builds the client or calls the database', () => {
  const body = bodyOf(portalClientSource(), 'issuePortalCode')
  assert.match(body, /^export async function issuePortalCode\(token: string\): Promise<IssueCodeResult> \{/)
  const guard = body.indexOf("if (!isPortalToken(token)) return { ok: false, reason: 'invalid' }")
  assert.ok(guard > -1, 'a malformed token is the invalid refusal')
  assert.ok(body.indexOf('createAdminSupabase(') > guard, 'the client is built only after the check')
  assert.ok(body.indexOf(".rpc('portal_issue_code', { p_token: token })") > guard, 'the database is called only after the check')
  assert.match(body, /if \(error\) throw failure\('portal_issue_code', error\)/, 'a database error is reduced to its code')
  assert.match(body, /return readIssueCodeAnswer\(data\)/, 'the answer is checked and mapped before it is handed on')
  assert.equal(count(body, 'return '), 2, 'the refusal and the checked answer: nothing else leaves')
})

test('submitPortalDecision sends the checked input and the evidence under the thirteen names portal_decide takes', () => {
  const body = bodyOf(portalClientSource(), 'submitPortalDecision')
  assert.match(
    body,
    /^export async function submitPortalDecision\(\s*input: DecideInput,\s*evidence: \{ ip: string \| null; userAgent: string \| null \},?\s*\): Promise<DecideResult> \{/,
  )
  const guard = body.indexOf("if (!isPortalToken(input.token)) return { ok: false, reason: 'invalid' }")
  assert.ok(guard > -1, 'a malformed token is the invalid refusal')
  assert.ok(body.indexOf('createAdminSupabase(') > guard, 'the client is built only after the check')
  assert.ok(body.indexOf(".rpc('portal_decide', {") > guard, 'the database is called only after the check')
  assert.match(body, /if \(error\) throw failure\('portal_decide', error\)/)
  assert.match(body, /return readDecideAnswer\(data\)/)

  // Every parameter, by name, from the field it belongs to.
  const call = body.slice(body.indexOf(".rpc('portal_decide', {"), body.indexOf('})', body.indexOf(".rpc('portal_decide', {")))
  const sent = Object.fromEntries([...call.matchAll(/(p_\w+): ([\w.]+)/g)].map((match) => [match[1], match[2]]))
  assert.deepEqual(sent, {
    p_token: 'input.token',
    p_code: 'input.code',
    p_decision: 'input.decision',
    p_signatory_name: 'input.signatoryName',
    p_signatory_position: 'input.signatoryPosition',
    p_signatory_organisation: 'input.signatoryOrganisation',
    p_consent_text: 'input.consentText',
    p_consent: 'input.consent',
    p_snapshot_hash: 'input.snapshotHash',
    p_decline_reason: 'input.declineReason',
    p_decline_comments: 'input.declineComments',
    p_ip: 'evidence.ip',
    p_user_agent: 'evidence.userAgent',
  })

  // The database API matches arguments by name: the names are exactly the function's own, read from its migration.
  const sql = read('supabase', 'migrations', '20261020103000_quote_portal_decide.sql')
  const signature = sql.match(/create or replace function public\.portal_decide\(([\s\S]*?)\)\s*returns jsonb/)?.[1]
  assert.ok(signature, 'the portal_decide signature is found')
  const parameters = [...signature.matchAll(/(p_\w+) (?:text|boolean)/g)].map((match) => match[1])
  assert.equal(parameters.length, 13)
  assert.deepEqual(Object.keys(sent), parameters, 'the same names, in the same order')
})

test('the code and the decision functions are granted to service_role only, which is why portal-client calls them', () => {
  const codes = read('supabase', 'migrations', '20261020102000_quote_portal_code_functions.sql')
  assert.match(codes, /revoke all on function public\.portal_issue_code\(text\) from public, anon, authenticated;\ngrant execute on function public\.portal_issue_code\(text\) to service_role;/)
  const decide = read('supabase', 'migrations', '20261020103000_quote_portal_decide.sql')
  assert.match(decide, /revoke all on function public\.portal_decide\([^)]*\)\s*from public, anon, authenticated;\ngrant execute on function public\.portal_decide\([^)]*\)\s*to service_role;/)
})

test('the answer reader is pure and its errors carry nothing of the answer', () => {
  const source = read('lib', 'quote-portal', 'decision-answers.ts')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m, 'no directive')
  assert.doesNotMatch(source, /server-only|from '@\//, 'relative imports only, so node --test can load it')
  assert.doesNotMatch(source, /supabase|console\./)
  // Each error is one fixed sentence: nothing of the data is spliced into it.
  for (const thrown of source.match(/new Error\([^)]*\)/g) ?? []) {
    assert.match(thrown, /^new Error\('[^'$`]*'\)$/, `a fixed message: ${thrown}`)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Requesting a code (source)
// ---------------------------------------------------------------------------------------------------------------

test('requestCodeAction is a server action that takes the token alone', () => {
  const source = requestCodeSource()
  assertServerActionFile(source, 'request-code.ts')
  assert.equal(count(source, '\nexport '), 1, 'one action')
  assert.match(source, /^export async function requestCodeAction\(token: string\): Promise</m, 'no address parameter: the browser cannot choose where the code goes')
  assert.match(source, /^import \{ issuePortalCode \} from '@\/lib\/quote-portal\/portal-client'$/m)
  assert.match(source, /^import \{ sendEmail \} from '@\/lib\/email\/send-email'$/m)
  assert.doesNotMatch(source, /supabase\/admin|createAdminSupabase|process\.env/, 'the database only through portal-client')
})

test('the code is emailed only to the address the database returned, after the refusals', () => {
  const body = bodyOf(requestCodeSource(), 'requestCodeAction')
  assert.equal(count(body, 'issuePortalCode('), 1)
  assert.match(body, /await issuePortalCode\(token\)/)
  assert.equal(count(body, 'sendEmail('), 1, 'one send')
  assert.match(
    body,
    /await sendEmail\(\{\s*to: issued\.recipientEmail,\s*template: quoteCodeEmailTemplate\(\{ code: issued\.code, quoteNumber: issued\.quoteNumber, clientName: issued\.clientName \}\),?\s*\}\)/,
  )
  assert.equal(count(body, 'to:'), 1, 'one recipient')
  const refused = body.indexOf('if (!issued.ok) return { ok: false, message: refusalMessage(issued.reason) }')
  assert.ok(refused > -1, 'a refusal is its message')
  assert.ok(body.indexOf('sendEmail(') > refused, 'nothing is sent for a refusal')
})

test('the browser hears where the code went, masked, and never the code, the token or the address', () => {
  const body = bodyOf(requestCodeSource(), 'requestCodeAction')
  assert.match(body, /return \{ ok: true, maskedEmail: maskEmail\(issued\.recipientEmail\), expiresInMinutes: 10 \}/)
  for (const line of body.split('\n')) {
    const returned = line.match(/\breturn\b(.*)$/)?.[1]
    if (returned === undefined) continue
    assert.doesNotMatch(returned.replace('maskEmail(issued.recipientEmail)', ''), /\btoken\b|\.code\b|recipientEmail|\bissued\b(?!\.reason)/, `returned: ${line.trim()}`)
  }
  // A failed send is its own message, and the send sits in a try whose catch returns it and never rethrows.
  const send = body.indexOf('await sendEmail(')
  const tried = body.lastIndexOf('try {', send)
  const caught = body.indexOf('} catch', send)
  assert.ok(tried > -1 && caught > send, 'the send is inside a try')
  const handler = body.slice(caught, body.indexOf('\n  }', caught))
  assert.match(handler, /return \{ ok: false, message: refusalMessage\('send_failed'\) \}/)
  assert.doesNotMatch(handler, /\bthrow\b/)
  assert.doesNotMatch(handler, /\.message\b/, 'the mail server error can quote the address, so it is not logged')
  // A database failure is a plain message too, never thrown at the browser.
  const issue = body.indexOf('await issuePortalCode(')
  const issueCatch = body.indexOf('} catch', issue)
  assert.ok(body.lastIndexOf('try {', issue) > -1 && issueCatch > issue && issueCatch < send, 'the database call has its own try')
  assert.match(body.slice(issueCatch, send), /return \{ ok: false, message: REFUSAL_FALLBACK \}/)
  assert.doesNotMatch(body, /\bthrow\b/)
})

test('requestCodeAction logs neither the token, the code nor an address', () => {
  const lines = logLines(requestCodeSource())
  assert.equal(lines.length, 2, 'one line for a database failure, one for a failed send')
  for (const line of lines) {
    assert.doesNotMatch(line, /\btoken\b|\bcode\b|email|recipient|address|\bto\b|template/i, line)
  }
  assert.ok(lines.some((line) => line.includes('issued.quoteNumber')), 'a failed send names the quote by its number')
})

// ---------------------------------------------------------------------------------------------------------------
// Sending a decision (source)
// ---------------------------------------------------------------------------------------------------------------

test('decideAction is a server action that takes the raw form', () => {
  const source = decideSource()
  assertServerActionFile(source, 'decide.ts')
  assert.equal(count(source, '\nexport '), 1, 'one action')
  assert.match(source, /^export async function decideAction\(raw: Record<string, unknown>\): Promise</m)
  assert.match(source, /^import \{ headers \} from 'next\/headers'$/m)
  assert.match(source, /^import \{ submitPortalDecision \} from '@\/lib\/quote-portal\/portal-client'$/m)
  assert.match(source, /^import \{ sendDecisionEmails \} from '\.\.\/send-decision-emails'$/m)
  assert.match(source, /^import \{ readEvidence \} from '\.\.\/evidence'$/m)
  assert.doesNotMatch(source, /supabase\/admin|createAdminSupabase|process\.env|sendEmail\(/, 'the database only through portal-client, the mail only through sendDecisionEmails')
})

test('the form is checked before anything else, and field errors go back without a database call', () => {
  const body = bodyOf(decideSource(), 'decideAction')
  const normalised = body.indexOf('normaliseDecisionInput(raw)')
  const refused = body.indexOf('if (!input.ok) return { ok: false, message: refusalMessage(\'incomplete\'), errors: input.errors }')
  const headersRead = body.indexOf('await headers()')
  const submitted = body.indexOf('submitPortalDecision(')
  assert.ok(normalised > -1, 'the form is checked')
  assert.ok(refused > normalised, 'field errors return at once')
  assert.ok(headersRead > refused && submitted > headersRead, 'then the headers, then the database')
  assert.equal(count(body, 'submitPortalDecision('), 1)
  assert.match(body, /readEvidence\(\(name\) => requestHeaders\.get\(name\)\)/)
  assert.match(body, /await submitPortalDecision\(input\.value, evidence\)/, 'only the checked input reaches the database')
})

test('the emails follow a new decision only, outside the try, and cannot change what the browser hears', () => {
  const body = bodyOf(decideSource(), 'decideAction')
  assert.equal(count(body, 'sendDecisionEmails('), 1)
  assert.match(body, /\n {2}if \(!result\.replay\) await sendDecisionEmails\(result\.outcome\)\n {2}return \{ ok: true, decision: result\.outcome\.decision, replay: result\.replay \}\n\}/, 'a replay sends nothing; the success answer follows the emails whatever they did')
  // The one try is the database call's, and it is closed before the emails.
  assert.equal(count(body, 'try {'), 1)
  const caught = body.indexOf('} catch')
  assert.ok(caught > body.indexOf('submitPortalDecision(') && caught < body.indexOf('sendDecisionEmails('), 'the emails are not inside the try')
  assert.match(body.slice(caught), /^\} catch \(error\) \{\n\s+console\.error\('\[quote-portal:decide\]', error instanceof Error \? error\.message : 'unknown error'\)\n\s+return \{ ok: false, message: REFUSAL_FALLBACK \}\n\s+\}/)
  assert.doesNotMatch(body, /\bthrow\b/)
  // A refusal is its message, its reason and, for a wrong code, the attempts left.
  assert.match(body, /message: refusalMessage\(result\.reason, result\.attemptsLeft\)/)
})

test('the browser hears the decision and whether it was a replay, never the outcome', () => {
  const body = bodyOf(decideSource(), 'decideAction')
  for (const line of body.split('\n')) {
    const returned = line.match(/\breturn\b(.*)$/)?.[1]
    if (returned === undefined) continue
    // The outcome holds the addresses and the signatory (a replay gives them back without a code): only its decision may leave.
    assert.doesNotMatch(returned.replace('result.outcome.decision', ''), /outcome|\.\.\.|recipient|notify|signatory|input\.value|evidence|\btoken\b|\bcode\b/, `returned: ${line.trim()}`)
  }
  for (const line of logLines(decideSource())) {
    assert.doesNotMatch(line, /\btoken\b|\bcode\b|email|recipient|address|raw|input|evidence|outcome/i, line)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The emails after a decision (source, and the date format)
// ---------------------------------------------------------------------------------------------------------------

test('sendDecisionEmails is a server-only module, not an action, and reads the app address itself', () => {
  const source = emailsSource()
  assert.ok(source.startsWith("import 'server-only'"), 'server-only is the first line')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m, 'a plain server module: it is not callable from a browser')
  const exported = [...source.matchAll(/^export\s+(.*)$/gm)].map((match) => match[1])
  assert.deepEqual(exported, ['async function sendDecisionEmails(outcome: DecisionOutcome): Promise<void> {'])
  assert.match(source, /^import \{ readAppUrl \} from '@\/lib\/env'$/m)
  assert.match(source, /^import \{ sendEmail \} from '@\/lib\/email\/send-email'$/m)
  assert.doesNotMatch(source, /supabase|portal-client/, 'it sends; it does not read')
})

test('both emails run side by side under allSettled, the owner notice only when there is someone to tell, and nothing throws', () => {
  const source = emailsSource()
  assert.doesNotMatch(source, /\bthrow\b/)
  const main = bodyOf(source, 'sendDecisionEmails')
  assert.match(main, /await Promise\.allSettled\(\[/)
  assert.match(main, /sendAcknowledgement\(outcome\)/)
  assert.match(main, /outcome\.notifyEmail \? sendOwnerNotice\(outcome, outcome\.notifyEmail\) : null/, 'no address, no notice')

  const acknowledgement = privateBodyOf(source, 'sendAcknowledgement')
  assert.match(acknowledgement, /to: outcome\.recipientEmail,/, 'the client hears at the address the code was verified at')
  assert.match(acknowledgement, /quoteAcknowledgementEmailTemplate\(\{\s*decision: outcome\.decision,\s*quoteNumber: outcome\.quoteNumber,\s*decidedOn: SOUTH_AFRICAN_DATE\.format\(new Date\(outcome\.decidedAt\)\),\s*ownerName: outcome\.ownerName,\s*signatoryName: outcome\.signatoryName,?\s*\}\)/)

  const notice = privateBodyOf(source, 'sendOwnerNotice')
  assert.match(notice, /^async function sendOwnerNotice\(outcome: DecisionOutcome, to: string\): Promise<void> \{/)
  assert.match(notice, /readAppUrl\(process\.env\)\.replace\(\/\\\/\+\$\/, ''\)/, 'read here, so a missing app address costs only the notice')
  assert.match(notice, /quoteUrl: `\$\{appUrl\}\/commercial\/quotes\/\$\{outcome\.quoteId\}`/)
  assert.match(notice, /quoteOwnerNoticeEmailTemplate\(\{\s*decision: outcome\.decision,\s*clientName: outcome\.clientName,\s*quoteNumber: outcome\.quoteNumber,\s*signatoryName: outcome\.signatoryName,\s*signatoryPosition: outcome\.signatoryPosition,\s*declineReason: outcome\.declineReason,\s*declineComments: outcome\.declineComments,\s*quoteUrl:/)
  assert.match(notice, /await sendEmail\(\{ to, template \}\)/)
})

test('a failed email is logged with the quote number only', () => {
  const lines = logLines(emailsSource())
  assert.ok(lines.length >= 1)
  for (const line of lines) {
    const printed = line.replace(/^console\.\w+\(/, '').replace(/\)$/, '')
    const identifiers = printed.match(/[A-Za-z_$][\w$.]*/g) ?? []
    assert.deepEqual([...new Set(identifiers)], ['outcome.quoteNumber'], line)
  }
})

test('the acknowledgement date is the South African day, written out', () => {
  const source = emailsSource()
  assert.match(source, /const SOUTH_AFRICAN_DATE = new Intl\.DateTimeFormat\('en-GB', \{ dateStyle: 'long', timeZone: 'Africa\/Johannesburg' \}\)/)
  const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Johannesburg' })
  assert.equal(format.format(new Date('2026-10-20T09:15:00.123456+00:00')), '20 October 2026')
  // 22:30 UTC is already the next day in Johannesburg (UTC+2).
  assert.equal(format.format(new Date('2026-10-19T22:30:00+00:00')), '20 October 2026')
})

// ---------------------------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------------------------

test('the portal page cannot ask for a code or decide: a render and a mail scanner only read', () => {
  const page = read('app', '(portal)', 'q', '[token]', 'page.tsx')
  assert.doesNotMatch(page, /issuePortalCode|submitPortalDecision/)
  assert.doesNotMatch(page, /readIssueCodeAnswer|readDecideAnswer|sendDecisionEmails/)
})
