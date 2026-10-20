import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { isPortalToken } from '../../lib/quote-portal/token.ts'
import { isViewableQuote, isViewableState, PORTAL_STATES, VIEWABLE_STATES, type PortalQuote, type PortalState } from '../../lib/quote-portal/types.ts'

// What the link is minted as: 32 random bytes, base64url, 43 characters, no padding.
const realToken = () => randomBytes(32).toString('base64url')

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('isPortalToken accepts a real 43-character token', () => {
  const token = realToken()
  assert.equal(token.length, 43)
  assert.equal(isPortalToken(token), true)
})

test('isPortalToken accepts every token the minting recipe can produce', () => {
  for (let index = 0; index < 500; index += 1) {
    const token = realToken()
    assert.equal(token.length, 43)
    assert.equal(isPortalToken(token), true, token)
  }
  // The edges of the alphabet: the two url-safe characters, digits and both letter cases.
  assert.equal(isPortalToken('A'.repeat(43)), true)
  assert.equal(isPortalToken('z'.repeat(43)), true)
  assert.equal(isPortalToken('0'.repeat(43)), true)
  assert.equal(isPortalToken('-'.repeat(43)), true)
  assert.equal(isPortalToken('_'.repeat(43)), true)
})

test('isPortalToken rejects the empty string and every wrong length', () => {
  const token = realToken()
  assert.equal(isPortalToken(''), false)
  assert.equal(isPortalToken(token.slice(0, 42)), false, '42 characters')
  assert.equal(isPortalToken(`${token}A`), false, '44 characters')
  assert.equal(isPortalToken(token.slice(0, 1)), false, '1 character')
  assert.equal(isPortalToken(token.repeat(2)), false, 'two tokens run together')
  assert.equal(isPortalToken('a'.repeat(1000)), false, 'a very long string')
})

test('isPortalToken rejects whitespace padding, including a trailing newline', () => {
  const token = realToken()
  for (const padded of [` ${token}`, `${token} `, ` ${token} `, `\t${token}`, `${token}\t`, `${token}\n`, `\n${token}`, `${token}\r\n`, `${token}\r`]) {
    assert.equal(isPortalToken(padded), false, JSON.stringify(padded))
  }
  // Padding that keeps the length at 43 still fails, because the padding is not in the alphabet.
  assert.equal(isPortalToken(` ${token.slice(1)}`), false, 'a leading space in place of the first character')
  assert.equal(isPortalToken(`${token.slice(0, 42)} `), false, 'a trailing space in place of the last character')
  assert.equal(isPortalToken(`${token.slice(0, 42)}\n`), false, 'a trailing newline in place of the last character')
})

test('isPortalToken rejects the standard base64 characters and the padding character', () => {
  const token = realToken()
  for (const bad of ['+', '/', '=']) {
    assert.equal(isPortalToken(`${bad}${token.slice(1)}`), false, `${bad} first`)
    assert.equal(isPortalToken(`${token.slice(0, 20)}${bad}${token.slice(21)}`), false, `${bad} in the middle`)
    assert.equal(isPortalToken(`${token.slice(0, 42)}${bad}`), false, `${bad} last`)
  }
  assert.equal(isPortalToken(`${token.slice(0, 42)}=`), false, 'a padded 43-character body')
  assert.equal(isPortalToken(`${token}=`), false, 'a token plus base64 padding')
})

test('isPortalToken rejects hostile 43-character strings', () => {
  const hostile = [
    `'; drop table quotes; --${'a'.repeat(19)}`,
    `' OR '1'='1' --${'a'.repeat(28)}`,
    `${'a'.repeat(41)}%27`,
    `${'a'.repeat(40)}%00`,
    `${'a'.repeat(42)}\u0000`,
    `<script>alert(1)</script>${'a'.repeat(18)}`,
    `../../../../etc/passwd${'a'.repeat(21)}`,
    `${'a'.repeat(42)}é`,
    `${'a'.repeat(42)}Ａ`,
    `${'a'.repeat(41)}😀`,
    `${'a'.repeat(42)}.`,
    `${'a'.repeat(42)}~`,
  ]
  for (const value of hostile) assert.equal(isPortalToken(value), false, JSON.stringify(value))
})

test('isPortalToken rejects every value that is not a string, even one that prints as a token', () => {
  const token = realToken()
  const notStrings: unknown[] = [
    undefined,
    null,
    0,
    43,
    true,
    {},
    [],
    [token],
    { toString: () => token },
    new String(token),
    Buffer.from(token),
    Symbol('token'),
    () => token,
  ]
  for (const value of notStrings) assert.equal(isPortalToken(value), false, String(typeof value))
})

test('isPortalToken narrows an unknown value to a string', () => {
  const candidate: unknown = realToken()
  if (isPortalToken(candidate)) {
    const length: number = candidate.length
    assert.equal(length, 43)
  } else {
    assert.fail('a real token narrows to string')
  }
})

test('isPortalToken agrees with the database check on a corpus of well-formed and malformed tokens', () => {
  // The database refuses a token that does not match this pattern before it hashes it; the two checks must not drift.
  const sql = read('supabase', 'migrations', '20261018102500_quote_portal_read_fixes.sql')
  const match = sql.match(/p_token !~ '([^']+)'/)
  assert.ok(match, 'portal_get_quote checks the token with a pattern')
  const database = new RegExp(match[1])
  const token = realToken()
  const corpus = [
    token, token.toUpperCase(), token.toLowerCase(), token.slice(0, 42), `${token}A`, ` ${token}`, `${token}\n`, '', 'a', '-'.repeat(43),
    `${token.slice(0, 42)}+`, `${token.slice(0, 42)}/`, `${token.slice(0, 42)}=`, `'${'a'.repeat(42)}`, `${'a'.repeat(42)}é`,
  ]
  for (const value of corpus) assert.equal(isPortalToken(value), database.test(value), JSON.stringify(value))
})

test('PORTAL_STATES lists the six states the database can return', () => {
  assert.deepEqual([...PORTAL_STATES], ['open', 'accepted', 'declined', 'expired', 'superseded', 'invalid'])
  const sql = read('supabase', 'migrations', '20261018102500_quote_portal_read_fixes.sql')
  for (const state of PORTAL_STATES) {
    assert.ok(sql.includes(`'${state}'`), `the database can answer ${state}`)
  }
})

test('isViewableState is true for open, accepted and declined only', () => {
  for (const state of ['open', 'accepted', 'declined']) assert.equal(isViewableState(state), true, state)
  for (const state of ['expired', 'superseded', 'invalid']) assert.equal(isViewableState(state), false, state)
  assert.deepEqual([...VIEWABLE_STATES], ['open', 'accepted', 'declined'])
  // Anything that is not one of the six names is not viewable, whatever it is.
  for (const value of ['', 'OPEN', 'Open', ' open', 'open ', 'sent', 'draft', undefined, null, 0, {}, ['open']]) {
    assert.equal(isViewableState(value), false, JSON.stringify(value) ?? String(value))
  }
  // Every state is classified one way or the other.
  const states: PortalState[] = [...PORTAL_STATES]
  assert.equal(states.filter((state) => isViewableState(state)).length, 3)
})

const owner = { name: 'Olive Owner', email: 'olive.owner@example.test', job_title: 'Client Director' }
const fullRecord = {
  quote_number: 'HMK-Q-2026-00046', status: 'Sent', issue_date: '2026-10-18', valid_until: '2026-11-17', currency: 'ZAR',
  client_name: 'Portal Client', contact_name: 'Pat Client', client_ref: null, project_name: 'Growth programme', project_description: null,
  project_ref: null, vat_rate: 15, subtotal: '1000.00', tax_amount: 150, total_amount: 1150, terms: 'Pay within 30 days.',
  service_inclusions: null, terms_sources: [{ layer: 'base', version: 2 }], bill_to: { name: 'Portal Client' }, issuer: { legal_name: 'HIMARK' },
  sent_at: '2026-10-18T08:00:00+00:00', accepted_at: null,
}
const fullQuote = (state: 'open' | 'accepted' | 'declined'): PortalQuote => ({
  state, expires_at: '2026-11-17T22:00:00+00:00', recipient_email: 'pat.client@example.test', recipient_name: 'Pat Client',
  record: fullRecord, lines: [], version: 1, replaces_number: null, owner,
})
const shortQuote = (state: 'expired' | 'superseded'): PortalQuote => ({
  state, record: { quote_number: 'HMK-Q-2026-00046', client_name: 'Portal Client', valid_until: '2026-11-17' },
  version: 2, replaces_number: 'HMK-Q-2026-00045', owner: null,
})

test('isViewableQuote narrows the portal result to the full shape for open, accepted and declined', () => {
  for (const state of ['open', 'accepted', 'declined'] as const) {
    const quote = fullQuote(state)
    if (isViewableQuote(quote)) {
      // These properties exist only on the full shape, so this compiles only when the guard narrows.
      assert.equal(quote.recipient_email, 'pat.client@example.test')
      assert.equal(quote.record.quote_number, 'HMK-Q-2026-00046')
      assert.deepEqual(quote.lines, [])
    } else {
      assert.fail(`${state} is viewable`)
    }
  }
})

test('isViewableQuote is false for expired, superseded and invalid, and the short shape carries no lines', () => {
  for (const state of ['expired', 'superseded'] as const) {
    const quote = shortQuote(state)
    assert.equal(isViewableQuote(quote), false, state)
    assert.equal('lines' in quote, false, `${state} has no lines`)
    assert.equal('recipient_email' in quote, false, `${state} has no recipient`)
    assert.equal('expires_at' in quote, false, `${state} has no link expiry`)
  }
  const invalid: PortalQuote = { state: 'invalid' }
  assert.equal(isViewableQuote(invalid), false)
  assert.deepEqual(Object.keys(invalid), ['state'])
})
