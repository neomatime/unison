import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Quote portal, slice 1, task 11: the staff side. The state of a link and "was its email confirmed" are pure and tested
// here; the query, the two actions, the panel and the Revise button are server code that node --test cannot load, so
// they get source guards. The signed-in staff page is not exercised by these tests (it needs a session).

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const loadState = () => import('../../features/quote-portal/link-state.ts')

/** The text of one exported function, up to the next top-level export (or the end of the file). */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > -1, `${name} is exported as an async function`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const EXPIRES = '2026-10-20T22:00:00+00:00'
const link = (over: Partial<{ expires_at: string; revoked_at: string | null; revoked_reason: string | null }> = {}) => ({
  expires_at: EXPIRES,
  revoked_at: null,
  revoked_reason: null,
  ...over,
})

// ---- linkState ----

test('a link that is not revoked and has not expired is Active', async () => {
  const { linkState } = await loadState()
  assert.equal(linkState(link(), new Date('2026-10-19T08:00:00Z')), 'Active')
})

test('the exact moment a link expires it is Expired, and one millisecond before it is still Active', async () => {
  const { linkState } = await loadState()
  const at = new Date(EXPIRES)
  assert.equal(linkState(link(), new Date(at.getTime() - 1)), 'Active')
  assert.equal(linkState(link(), new Date(at.getTime())), 'Expired', 'now === expires_at is Expired')
  assert.equal(linkState(link(), new Date(at.getTime() + 1)), 'Expired')
  assert.equal(linkState(link({ expires_at: '2026-10-20T22:00:00Z' }), new Date('2026-10-20T22:00:00.000Z')), 'Expired', 'the same instant written with Z')
})

test('a link revoked by staff, or for any reason that is not a system reason, is Revoked', async () => {
  const { linkState } = await loadState()
  const now = new Date('2026-10-19T08:00:00Z')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'revoked by staff' }), now), 'Revoked')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'wrong address' }), now), 'Revoked')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: null }), now), 'Revoked', 'a revoked link with no reason is still revoked')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: '' }), now), 'Revoked')
})

test('a revoked link stays Revoked after its expiry date: the revocation is the more useful fact', async () => {
  const { linkState } = await loadState()
  const later = new Date('2026-12-01T00:00:00Z')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'revoked by staff' }), later), 'Revoked')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'superseded' }), later), 'Superseded')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'email not sent' }), later), 'Not sent')
})

test("a link revoked as 'superseded' is Superseded, and as 'email not sent' is Not sent", async () => {
  const { linkState } = await loadState()
  const now = new Date('2026-10-19T08:00:00Z')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'superseded' }), now), 'Superseded')
  assert.equal(linkState(link({ revoked_at: '2026-10-19T07:00:00Z', revoked_reason: 'email not sent' }), now), 'Not sent')
})

test("a link the nightly job revoked as 'expired' reads Expired, never Revoked: nobody revoked it", async () => {
  const { linkState } = await loadState()
  const after = new Date('2026-10-21T00:00:00Z')
  assert.equal(linkState(link({ revoked_at: '2026-10-20T22:10:00Z', revoked_reason: 'expired' }), after), 'Expired')
  assert.equal(linkState(link({ revoked_at: '2026-10-20T22:10:00Z', revoked_reason: 'expired' }), new Date('2026-10-19T08:00:00Z')), 'Expired', 'whatever the clock says')
})

test('a reason without a revocation time is ignored: only revoked_at revokes', async () => {
  const { linkState } = await loadState()
  const now = new Date('2026-10-19T08:00:00Z')
  assert.equal(linkState(link({ revoked_reason: 'superseded' }), now), 'Active')
  assert.equal(linkState(link({ revoked_reason: 'email not sent' }), now), 'Active')
})

test('an expiry that cannot be read is never reported as Active', async () => {
  const { linkState } = await loadState()
  assert.equal(linkState(link({ expires_at: 'not a date' }), new Date('2026-10-19T08:00:00Z')), 'Expired')
  assert.equal(linkState(link({ expires_at: '' }), new Date('2026-10-19T08:00:00Z')), 'Expired')
})

// ---- isLinkEmailConfirmed ----
// Rulings 26 and 28: an email confirms at most one link, the latest link to the same address that was made at or before the
// instant the email was recorded, exactly (no tolerance: both times are the database's clock, and an email is recorded only
// after its link was made). So a retry's email can never confirm the earlier, abandoned link, and a quick resend does not
// steal the email of the link before it.

const T0 = Date.parse('2026-10-19T08:00:00Z')
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()
const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const ADDRESS = 'client@example.com'
const aLink = (id: string, offsetMs: number, address = ADDRESS) => ({ id, recipient_email: address, created_at: iso(offsetMs) })
const aMail = (offsetMs: number, address = ADDRESS) => ({ to_address: address, sent_at: iso(offsetMs) })

test('an email sent just after a link was made confirms that link', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const only = aLink('only', 0)
  assert.equal(isLinkEmailConfirmed(only, [only], [aMail(2 * SECOND)]), true)
  assert.equal(isLinkEmailConfirmed(only, [only], [aMail(0)]), true, 'at the same instant')
  assert.equal(isLinkEmailConfirmed(only, [only], [aMail(3 * HOUR)]), true, 'with no later link to compete for it, a late email still goes to the only link')
})

test('the retry story: a link abandoned as "email not sent" is not confirmed by the email of the retry', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const first = aLink('link-1', 0) // the send failed, so this link was revoked as 'email not sent'
  const retry = aLink('link-2', 10 * MINUTE) // staff retried: a new link
  const emails = [aMail(10 * MINUTE + 3 * SECOND)] // and only the retry's email went out
  for (const links of [[retry, first], [first, retry]]) {
    assert.equal(isLinkEmailConfirmed(retry, links, emails), true, 'the retry is confirmed')
    assert.equal(isLinkEmailConfirmed(first, links, emails), false, 'the abandoned link is not, however late the email was')
  }
})

test('the abandon-failed form: a first link still Active after a quick retry is not confirmed either', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  // The helper does not look at state; the first link here is simply the earlier one of two to the same address.
  const first = aLink('link-1', 0)
  const retry = aLink('link-2', 90 * SECOND)
  const emails = [aMail(95 * SECOND)]
  assert.equal(isLinkEmailConfirmed(retry, [retry, first], emails), true)
  assert.equal(isLinkEmailConfirmed(first, [retry, first], emails), false)
})

test('two sends to the same address with two links: each email confirms its own link, in order', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const one = aLink('link-1', 0)
  const two = aLink('link-2', 2 * HOUR)
  const links = [two, one]
  const both = [aMail(2 * HOUR + 4 * SECOND), aMail(3 * SECOND)] // newest first, as the query returns them
  assert.equal(isLinkEmailConfirmed(one, links, both), true)
  assert.equal(isLinkEmailConfirmed(two, links, both), true)
  assert.equal(isLinkEmailConfirmed(one, links, [aMail(3 * SECOND)]), true, 'only the first email is on record')
  assert.equal(isLinkEmailConfirmed(two, links, [aMail(3 * SECOND)]), false, 'so the second link has none')
  assert.equal(isLinkEmailConfirmed(one, links, [aMail(2 * HOUR + 4 * SECOND)]), false, 'only the second email is on record: it is the second link\'s')
  assert.equal(isLinkEmailConfirmed(two, links, [aMail(2 * HOUR + 4 * SECOND)]), true)
})

test('an email confirms at most one link, even when two links to the address were made at the same instant', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const a = aLink('a', 0)
  const b = aLink('b', 0)
  const confirmed = [a, b].filter((link) => isLinkEmailConfirmed(link, [a, b], [aMail(SECOND)]))
  assert.equal(confirmed.length, 1)
  const again = [b, a].filter((link) => isLinkEmailConfirmed(link, [b, a], [aMail(SECOND)]))
  assert.deepEqual(again.map((link) => link.id), confirmed.map((link) => link.id), 'whichever order the links arrive in')
})

test('the address is compared without regard to case or surrounding spaces', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const lower = aLink('lower', 0)
  assert.equal(isLinkEmailConfirmed(lower, [lower], [aMail(SECOND, 'Client@Example.COM')]), true)
  assert.equal(isLinkEmailConfirmed(lower, [lower], [aMail(SECOND, '  client@example.com ')]), true)
  const upper = aLink('upper', 0, 'Client@Example.com')
  assert.equal(isLinkEmailConfirmed(upper, [upper], [aMail(SECOND, 'client@example.com')]), true)
  // A later link to the same person is the same person whatever its case: it takes the email, not the earlier link.
  const first = aLink('first', 0, 'client@example.com')
  const second = aLink('second', 10 * MINUTE, 'CLIENT@example.com')
  assert.equal(isLinkEmailConfirmed(second, [second, first], [aMail(10 * MINUTE + SECOND, 'client@example.com')]), true)
  assert.equal(isLinkEmailConfirmed(first, [second, first], [aMail(10 * MINUTE + SECOND, 'client@example.com')]), false)
})

test('a quick resend: each email confirms its own link, so both links are confirmed', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const a = aLink('A', 0)
  const b = aLink('B', 30 * SECOND) // staff resent 30 seconds later
  const e1 = aMail(5 * SECOND) // recorded for A before B existed
  const e2 = aMail(35 * SECOND)
  for (const links of [[b, a], [a, b]]) {
    for (const emails of [[e2, e1], [e1, e2]]) {
      assert.equal(isLinkEmailConfirmed(a, links, emails), true, 'E1 pairs with A, the latest link made at or before it')
      assert.equal(isLinkEmailConfirmed(b, links, emails), true, 'E2 pairs with B')
    }
  }
  // Each link needs its own email: E1 alone confirms A only, E2 alone confirms B only.
  assert.equal(isLinkEmailConfirmed(a, [b, a], [e1]), true)
  assert.equal(isLinkEmailConfirmed(b, [b, a], [e1]), false, 'B was made after E1 was recorded, so E1 is not its email')
  assert.equal(isLinkEmailConfirmed(a, [b, a], [e2]), false)
  assert.equal(isLinkEmailConfirmed(b, [b, a], [e2]), true)
})

test('an email recorded before a link was made does not confirm that link, but confirms the earlier link to the same address', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const earlier = aLink('earlier', 0)
  const later = aLink('later', 10 * SECOND)
  const email = [aMail(9 * SECOND)] // one second before `later` was made
  assert.equal(isLinkEmailConfirmed(later, [later, earlier], email), false)
  assert.equal(isLinkEmailConfirmed(earlier, [later, earlier], email), true)
  // With no earlier link to take it, the email confirms nothing, by a second or by a millisecond.
  assert.equal(isLinkEmailConfirmed(later, [later], email), false, 'one second before')
  assert.equal(isLinkEmailConfirmed(later, [later], [aMail(10 * SECOND - 1)]), false, 'one millisecond before')
})

test('an email recorded at the very instant its link was made confirms it', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const earlier = aLink('earlier', -5 * SECOND)
  const link = aLink('link', 0)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(0)]), true, 'sent_at === created_at')
  assert.equal(isLinkEmailConfirmed(link, [link, earlier], [aMail(0)]), true, 'and it beats the earlier link')
  assert.equal(isLinkEmailConfirmed(earlier, [link, earlier], [aMail(0)]), false)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(1)]), true, 'a millisecond after')
})

test('an email to a different address never confirms a link, and does not take a link away from its own recipient', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const client = aLink('client', 0)
  assert.equal(isLinkEmailConfirmed(client, [client], [aMail(SECOND, 'someone.else@example.com')]), false)
  assert.equal(isLinkEmailConfirmed(client, [client], [aMail(SECOND, 'client@example.com.au')]), false, 'a longer address is not the same address')
  assert.equal(isLinkEmailConfirmed(client, [client], [aMail(SECOND, 'xclient@example.com')]), false)
  // A later link to someone else is not a rival: "latest" means the latest to the same address.
  const other = aLink('other', 5 * MINUTE, 'colleague@example.com')
  assert.equal(isLinkEmailConfirmed(client, [other, client], [aMail(10 * MINUTE)]), true)
  assert.equal(isLinkEmailConfirmed(other, [other, client], [aMail(10 * MINUTE)]), false, 'and the email, sent to the client, is not the colleague\'s')
})

test('two different addresses never cross-confirm: each email goes to the link for its own address only', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const toClient = aLink('to-client', 0)
  const toColleague = aLink('to-colleague', 0, 'colleague@example.com')
  const links = [toColleague, toClient]
  assert.equal(isLinkEmailConfirmed(toClient, links, [aMail(5 * SECOND)]), true)
  assert.equal(isLinkEmailConfirmed(toColleague, links, [aMail(5 * SECOND)]), false, 'an email to the client says nothing about the colleague\'s link')
  assert.equal(isLinkEmailConfirmed(toColleague, links, [aMail(5 * SECOND, 'colleague@example.com')]), true)
  assert.equal(isLinkEmailConfirmed(toClient, links, [aMail(5 * SECOND, 'colleague@example.com')]), false)
  const both = [aMail(5 * SECOND, 'colleague@example.com'), aMail(6 * SECOND)]
  assert.equal(isLinkEmailConfirmed(toClient, links, both), true)
  assert.equal(isLinkEmailConfirmed(toColleague, links, both), true)
})

test('an email sent long before the link was made never confirms it', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const link = aLink('link', 24 * HOUR)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(0)]), false, 'yesterday')
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(24 * HOUR - 61 * SECOND)]), false)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(24 * HOUR - 59 * SECOND)]), false, 'nor does one recorded 59 seconds earlier: there is no grace period')
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(24 * HOUR - 1)]), false, 'nor one millisecond earlier')
})

test('with no emails at all, or a link that is not among the links, nothing is confirmed', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const link = aLink('link', 0)
  assert.equal(isLinkEmailConfirmed(link, [link], []), false, 'nothing was emailed')
  assert.equal(isLinkEmailConfirmed(link, [], [aMail(SECOND)]), false)
})

test('times are compared as instants, whatever offset they were written with', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  // 10:30+02:00 is 08:30Z. As text it sorts after 08:31Z; as an instant it is before it.
  const link = { id: 'link', recipient_email: ADDRESS, created_at: '2026-10-19T10:30:00+02:00' }
  assert.equal(isLinkEmailConfirmed(link, [link], [{ to_address: ADDRESS, sent_at: '2026-10-19T08:31:00Z' }]), true)
  // 10:00+02:00 is 08:00Z. As text it sorts after 08:30Z; as an instant the link, at 08:30Z, is half an hour too late.
  const late = { id: 'late', recipient_email: ADDRESS, created_at: '2026-10-19T08:30:00Z' }
  assert.equal(isLinkEmailConfirmed(late, [late], [{ to_address: ADDRESS, sent_at: '2026-10-19T10:00:00+02:00' }]), false)
  // The same instant written two ways is the same instant, to the second.
  const same = { id: 'same', recipient_email: ADDRESS, created_at: '2026-10-19T10:00:00+02:00' }
  assert.equal(isLinkEmailConfirmed(same, [same], [{ to_address: ADDRESS, sent_at: '2026-10-19T08:00:00Z' }]), true)
})

test('a time that cannot be read confirms nothing and takes nothing', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const broken = { id: 'broken', recipient_email: ADDRESS, created_at: 'garbage' }
  const fine = aLink('fine', 0)
  assert.equal(isLinkEmailConfirmed(broken, [broken], [aMail(SECOND)]), false)
  assert.equal(isLinkEmailConfirmed(fine, [fine], [{ to_address: ADDRESS, sent_at: 'garbage' }]), false)
  assert.equal(isLinkEmailConfirmed(fine, [broken, fine], [aMail(SECOND)]), true, 'a link with no usable time is not a rival')
})

test('the state module is pure: no directive, no server-only, no alias import, so node --test can load it', () => {
  const source = read('features', 'quote-portal', 'link-state.ts')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m)
  assert.doesNotMatch(source, /server-only/)
  assert.doesNotMatch(source, /from\s+['"]@\//)
})

test('pairing an email with a link has no grace period: no tolerance constant, no mention of a minute', () => {
  for (const [name, source] of [
    ['link-state.ts', read('features', 'quote-portal', 'link-state.ts')],
    ['client-response-panel.tsx', read('features', 'quote-portal', 'components', 'client-response-panel.tsx')],
  ] as const) {
    assert.doesNotMatch(source, /ONE_MINUTE|60_000|60 \* 1000|tolerance|\bminutes?\b/i, `${name}: both times are the database's clock, so the comparison is exact`)
  }
  const pairing = read('features', 'quote-portal', 'link-state.ts')
  assert.match(pairing, /created > sent\) continue/, 'a link made after the email was recorded is never its link')
})

// ---- the actions ----

const actions = () => read('features', 'quote-portal', 'actions', 'links.ts')

test("the links actions file is a 'use server' module that exports only async functions", () => {
  const source = actions()
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (!/^export /.test(line)) continue
    assert.match(line, /^export (async function|type) /, `exports something other than an async function or a type: ${line}`)
  }
  assert.match(source, /^export async function revokeLinkAction\(linkId: string, _previous: ActionState, _form: FormData\): Promise<ActionState>/m)
  assert.match(source, /^export async function reviseQuoteAction\(quoteId: string, _previous: ActionState, _form: FormData\): Promise<ActionState>/m)
})

test('both actions check the id with isUuid before the session or the database is touched', () => {
  const source = actions()
  assert.match(source, /import \{ isUuid \} from '@\/lib\/utils'/)
  for (const [name, id] of [['revokeLinkAction', 'linkId'], ['reviseQuoteAction', 'quoteId']] as const) {
    const body = bodyOf(source, name)
    const check = body.indexOf(`isUuid(${id})`)
    const context = body.indexOf('documentContext()')
    assert.ok(check > -1 && context > -1 && check < context, `${name}: isUuid(${id}) comes before documentContext()`)
    assert.match(body, new RegExp(`if \\(!isUuid\\(${id}\\)\\) return \\{ error: '[^']+' \\}`), `${name}: a malformed id returns a plain message`)
    assert.ok(body.indexOf('.rpc(') > context, `${name}: nothing is sent before the session is read`)
  }
})

test('revoking calls revoke_quote_access_link with the default reason, then refreshes the pages', () => {
  const body = bodyOf(actions(), 'revokeLinkAction')
  assert.match(body, /db\.rpc\('revoke_quote_access_link', \{ p_link_id: linkId \}\)/, 'no p_reason: the database default applies')
  assert.doesNotMatch(body, /p_reason/)
  assert.match(body, /if \(result\.error\) return failureState\(result\.error, '[^']+'\)/, 'the database decides; its tokens become plain messages')
  assert.ok(body.indexOf('revalidateDocumentPages()') > body.indexOf('if (result.error)'), 'the pages refresh only after a successful revoke')
  assert.match(body, /return \{ success: 'Link revoked\.' \}/)
  assert.equal(body.split('.rpc(').length - 1, 1, 'one database call')
  assert.doesNotMatch(body, /\.from\(|\.update\(|\.delete\(/, 'the function does the write, not the action')
})

test('revising calls revise_quote, refuses a result that is not an id, and redirects to the new draft', () => {
  const body = bodyOf(actions(), 'reviseQuoteAction')
  assert.match(body, /db\.rpc\('revise_quote', \{ p_id: quoteId \}\)/)
  assert.match(body, /if \(result\.error\) return failureState\(result\.error, '[^']+'\)/)
  assert.match(body, /if \(typeof result\.data !== 'string' \|\| !isUuid\(result\.data\)\) return \{ error: '[^']+' \}/, 'an unexpected result is not followed')
  assert.match(body, /redirect\(`\$\{DOCUMENTS\.quote\.base\}\/\$\{result\.data\}`\)/, 'the new draft is opened')
  assert.ok(body.indexOf('revalidateDocumentPages()') > body.indexOf('if (result.error)') && body.indexOf('revalidateDocumentPages()') < body.indexOf('redirect('), 'pages refresh, then redirect')
  assert.match(actions(), /import \{ redirect \} from 'next\/navigation'/)
  assert.equal(body.split('.rpc(').length - 1, 1, 'one database call')
  assert.doesNotMatch(body, /\.from\(|\.insert\(|\.update\(/, 'the copy is made by the database function')
  // redirect() throws: it must sit outside any try block.
  assert.doesNotMatch(body, /\btry\s*\{/)
})

test('the actions turn database tokens into plain messages through documentErrorMessage', () => {
  assert.match(actions(), /import \{ failureState \} from '@\/features\/documents\/action-failure'/)
  const failure = read('features', 'documents', 'action-failure.ts')
  assert.match(failure, /documentErrorMessage\(error\?\.message\)/)
  const errors = read('features', 'documents', 'errors.ts')
  for (const token of ['LINK_NOT_FOUND', 'QUOTE_NOT_FOUND', 'QUOTE_CANNOT_REVISE']) assert.match(errors, new RegExp(`\\['${token}',`), `${token} has a plain message`)
})

test('the actions neither use the service client nor handle a portal address', () => {
  const source = actions()
  assert.doesNotMatch(source, /supabase\/admin|portal-client|createAdminSupabase|process\.env/)
  assert.doesNotMatch(source, /token|\/q\//i, 'staff actions never see or build a portal address')
})

// ---- the query ----

const query = () => read('features', 'quote-portal', 'queries', 'list-quote-links.ts')

test('listQuoteLinks reads the links through the member session, scoped and newest first, never selecting a token column', () => {
  const source = query()
  assert.ok(source.startsWith("import 'server-only'"), 'server-only is the first line')
  assert.match(source, /export async function listQuoteLinks\(quoteId: string\)/)
  assert.match(source, /documentContext\(\)/, 'the signed-in member, not the service role')
  assert.doesNotMatch(source, /supabase\/admin|portal-client|createAdminSupabase/)
  assert.match(source, /from\('quote_access_links'\)/)
  assert.match(source, /\.select\('id,recipient_email,recipient_name,created_at,expires_at,first_viewed_at,last_viewed_at,revoked_at,revoked_reason'\)/, 'an explicit column list')
  assert.doesNotMatch(source, /select\('\*'\)/, 'no select-all on a table that has a hash column')
  assert.doesNotMatch(source, /token/i, 'the query never names a token column')
  assert.match(source, /\.eq\('quote_id', quoteId\)\s*\.eq\('organization_id', organization\.id\)\s*\.order\('created_at', \{ ascending: false \}\)/, 'this quote, this organisation, newest first')
  assert.match(source, /if \(links\.error\) throw links\.error/)
})

test('listQuoteLinks finds the numbers of the quote it replaces and the quotes that replace it, leaving out drafts', () => {
  const source = query()
  assert.match(source, /getDocument\('quote', quoteId\)/, 'the quote itself comes from the cached document read')
  assert.match(source, /supersedes_quote_id/)
  assert.match(source, /\.select\('quote_number'\)/, 'only the number of the other quote is read')
  assert.match(source, /\.eq\('supersedes_quote_id', quoteId\)/, 'the quotes that point back at this one')
  assert.match(source, /isDraftReference\(/, 'a DRAFT- reference is not a number worth showing')
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
})

test('the emails read is narrow: the address and time of each send for this quote, nothing else', () => {
  const source = query()
  assert.match(source, /export async function listQuoteSends\(quoteId: string\)/)
  assert.match(source, /from\('document_emails'\)\s*\.select\('to_address,sent_at'\)\s*\.eq\('quote_id', quoteId\)\s*\.eq\('organization_id', organization\.id\)/)
})

// ---- the panel ----

const panel = () => read('features', 'quote-portal', 'components', 'client-response-panel.tsx')

test('the panel is a server component in a "Client portal" section that renders nothing for a draft', () => {
  const source = panel()
  assert.doesNotMatch(source, /^\s*['"]use client['"]/)
  assert.doesNotMatch(source, /useState\(|useEffect\(|useActionState\(/)
  assert.match(source, /export async function ClientResponsePanel\(\{ quoteId \}: \{ quoteId: string \}\)/)
  assert.match(source, /<WorkspaceSection\s+title="Client portal"/)
  assert.match(source, /import \{ WorkspaceSection \} from '@\/features\/crm-workspace\/components\/workspace-section'/)
  const draft = source.indexOf("isDraftStatus('quote', bundle.record.status)")
  assert.ok(draft > -1, 'a draft is recognised with the shared helper')
  assert.match(source.slice(draft, draft + 120), /return null/, 'and renders nothing')
  assert.ok(draft < source.indexOf('listQuoteLinks('), 'the links are not even read for a draft')
})

test('with no links the panel says something only when the portal switch is on or a response is on record, and nothing at all otherwise', () => {
  const source = panel()
  assert.match(source, /quote_portal_enabled === true/, 'the switch is read from the same company settings the email action uses')
  assert.match(source, /if \(links\.length === 0 && responses\.length === 0 && !switchOn\) return null/, 'switch off, no links and no response: nothing; a quote with a response always shows the panel')
  assert.match(source, /links\.length === 0 \? \(/, 'switch on and no links: the one line')
})

test('each link shows its recipient, when it was made, when it expires, its state, and whether it was emailed', () => {
  const source = panel()
  assert.match(source, /linkState\(link, now\)/)
  assert.match(source, /isLinkEmailConfirmed\(link, links, sends\)/, 'the link is checked against all the links, so one email confirms one link')
  assert.doesNotMatch(source, /isLinkEmailConfirmed\(link, sends\)/, 'the old two-argument call is gone')
  assert.match(source, /link\.recipient_email/)
  assert.match(source, /Created \{when\(link\.created_at\)\}/)
  assert.match(source, /Expires \{when\(link\.expires_at\)\}/)
  assert.match(source, /'Emailed' : 'Not confirmed sent'/, 'an active link is not assumed to have been emailed')
})

test('a link that was Not sent shows no emailed or not-confirmed text: its badge already says it', () => {
  const source = panel()
  assert.match(
    source,
    /state === 'Not sent' \? null : <> · \{isLinkEmailConfirmed\(link, links, sends\) \? 'Emailed' : 'Not confirmed sent'\}<\/>/,
    'the text is behind the Not sent check',
  )
  assert.equal(source.split('Emailed').length - 1, 1, 'the word appears once, behind that check')
  assert.equal(source.split('Not confirmed sent').length - 1, 1)
})

test('the section says Opened is best effort and that scanners which do not run scripts are not counted; the empty line promises no link', () => {
  const source = panel()
  assert.match(source, /Opened is best effort: servers and mail scanners that do not run scripts are not counted\./)
  assert.doesNotMatch(source, /mail scanners do not count/)
  assert.match(source, /'A secure link is added to quote emails while the quote is awaiting a response\.'/)
  assert.doesNotMatch(source, /When you email it|carries a link|No secure link has been sent for this quote yet/, 'an archived or past-valid-until quote cannot get a link, so nothing promises one')
  assert.match(source, /'No secure link was sent for this quote\.'/, 'a quote that is no longer awaiting a response keeps its plain line')
})

test('the panel says Opened, never Read, and shows the first and the last time in South African time', () => {
  const source = panel()
  assert.match(source, /Opened \{when\(link\.first_viewed_at\)\}/)
  assert.match(source, /Not opened yet/)
  assert.match(source, /last opened \{when\(link\.last_viewed_at\)\}/)
  assert.doesNotMatch(source, /\bRead\b|\bread\b|\bseen\b/i, 'the word is Opened: a mail scanner never runs the page, but "read" would claim too much')
  assert.match(source, /new Intl\.DateTimeFormat\('en-GB', \{ dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa\/Johannesburg' \}\)/)
})

test('Revoke is offered only on a link that is Active, with its confirmation, and as a server action button', () => {
  const source = panel()
  assert.match(source, /import \{ ActionButton \} from '@\/features\/crm-workspace\/components\/action-button'/)
  assert.match(source, /import \{ revokeLinkAction \} from '\.\.\/actions\/links'/)
  assert.equal(source.split('revokeLinkAction').length - 1, 2, 'imported once, used once')
  assert.match(
    source,
    /state === 'Active' \? \(\s*<ActionButton\s+action=\{revokeLinkAction\.bind\(null, link\.id\)\}\s+label="Revoke"\s+ariaLabel=\{`Revoke link for \$\{link\.recipient_email\}`\}\s+tone="danger"\s+confirmText="Revoke this link\? The client will no longer be able to open it\."\s*\/>\s*\) : null/,
  )
  assert.equal(source.split('<ActionButton').length - 1, 1, 'one button, on the Active branch only')
})

test('the supersede chain says Replaces, and Revised as until the quote itself is Superseded, when it says Replaced by', () => {
  const source = panel()
  assert.match(source, /Replaces \{replacesNumber\}/)
  assert.match(source, /bundle\.record\.status === 'Superseded' \? 'Replaced by' : 'Revised as'/, "the wording depends on the quote's own status")
  assert.match(source, /\{replacedByLabel\} \{replacedBy\.join\(', '\)\}/, 'and is the one used in the line')
  assert.equal(source.split("'Replaced by'").length - 1, 1, 'each wording is written once')
  assert.equal(source.split("'Revised as'").length - 1, 1)
  assert.doesNotMatch(source, /Replaced by \{/, 'no fixed "Replaced by" line is left')
})

test('the panel never prints or links a portal address, a token or a hash, and uses no router link', () => {
  // The one hash the panel shows is the content hash of the quote as the client saw it (snapshot_hash); that is not the
  // secret part of a link, which is the hash this guard is about.
  const source = panel().replace(/snapshot_hash|Snapshot hash/g, '')
  assert.doesNotMatch(source, /token|hash/i, 'staff never see the secret part of a link')
  assert.doesNotMatch(source, /\/q\//, 'there is no staff-side link into the portal')
  assert.doesNotMatch(source, /next\/link|<Link\b/, 'the portal is not a page of the staff app: a plain anchor would be needed, and there is none')
  assert.doesNotMatch(source, /<a\b|href=/, 'no anchors at all')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'recipient names are text')
  assert.doesNotMatch(source, /supabase\/admin|portal-client/)
})

test('the quote page shows the panel straight after the email section, and the page wiring is unchanged', () => {
  const page = read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')
  assert.match(page, /import \{ ClientResponsePanel \} from '@\/features\/quote-portal\/components\/client-response-panel'/)
  const email = page.indexOf('<EmailSection kind="quote" id={quoteId} />')
  const portal = page.indexOf('<ClientResponsePanel quoteId={quoteId} />')
  const invoices = page.indexOf('<QuoteInvoices quoteId={quoteId} />')
  assert.ok(email > -1 && portal > email && invoices > portal, 'EmailSection, then ClientResponsePanel, then QuoteInvoices')
})

// ---- Revise this quote ----

test('Revise this quote is offered for a Sent, Declined or Expired quote and for no other, beside Duplicate as new draft', () => {
  const source = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(source, /import \{ duplicateQuoteAction, issueInvoiceAction, sendQuoteAction \} from '\.\.\/actions\/send'/, 'the existing imports are unchanged')
  assert.match(source, /import \{ reviseQuoteAction \} from '\.\.\/\.\.\/quote-portal\/actions\/links'/)
  const condition = source.match(/\{kind === 'quote' && \(([^)]*)\) \? \(\s*<ActionButton\s+action=\{reviseQuoteAction\.bind\(null, id\)\}/)
  assert.ok(condition, 'the Revise button sits behind a quote-only status condition')
  assert.equal(condition[1], "status === 'Sent' || status === 'Declined' || status === 'Expired'")
  for (const other of ['Draft', 'Internal Review', 'Accepted', 'Superseded']) assert.ok(!condition[1].includes(other), `${other} is not revisable`)
  assert.match(source, /label="Revise this quote"/)
  assert.match(source, /confirmText="Revise this quote\?[^"]*replaces this quote[^"]*"/, 'the confirmation says the original is replaced when the revision is sent')
  assert.ok(source.indexOf('duplicateQuoteAction.bind(null, id)') < source.indexOf('reviseQuoteAction.bind(null, id)'), 'beside Duplicate as new draft, after it')
  assert.match(source, /duplicateQuoteAction\.bind\(null, id\)\} label="Duplicate as new draft" \/>/, 'Duplicate as new draft is still there')
  assert.doesNotMatch(source, /useState\(|useEffect\(|useActionState\(/, 'still a server component')
})

// ---- Quote portal, slice 2, task 10: the recorded response ----
// responseAttribution and termsVersionLabels are pure and tested here. The query and the panel are server code that
// node --test cannot load, so they get source guards.

const loadAttribution = () => import('../../features/quote-portal/response-attribution.ts')
const response = (decision: 'accepted' | 'declined', decided_at: string) => ({ decision, decided_at })

test('responseAttribution is null unless the quote is Accepted or Declined, whatever responses exist', async () => {
  const { responseAttribution } = await loadAttribution()
  const some = [response('accepted', '2026-10-20T08:00:00Z')]
  for (const status of ['Draft', 'Internal Review', 'Sent', 'Expired', 'Superseded', 'accepted', 'declined', '']) {
    assert.equal(responseAttribution(status, []), null, `${status || '(empty)'} with no responses`)
    assert.equal(responseAttribution(status, some), null, `${status || '(empty)'} with a response`)
  }
})

test('an Accepted or Declined quote with no response on record was marked by staff', async () => {
  const { responseAttribution } = await loadAttribution()
  assert.equal(responseAttribution('Accepted', []), 'staff', 'a phone acceptance')
  assert.equal(responseAttribution('Declined', []), 'staff')
})

test("a response that agrees with the status is the client's", async () => {
  const { responseAttribution } = await loadAttribution()
  assert.equal(responseAttribution('Accepted', [response('accepted', '2026-10-20T08:00:00Z')]), 'client')
  assert.equal(responseAttribution('Declined', [response('declined', '2026-10-20T08:00:00Z')]), 'client')
})

test("a response that staff later contradicted by hand is not the status's: Marked by staff", async () => {
  const { responseAttribution } = await loadAttribution()
  assert.equal(responseAttribution('Accepted', [response('declined', '2026-10-20T08:00:00Z')]), 'staff', 'the client declined, staff set Accepted')
  assert.equal(responseAttribution('Declined', [response('accepted', '2026-10-20T08:00:00Z')]), 'staff', 'the client accepted, staff set Declined')
})

test('only the newest response counts, wherever it sits in the list', async () => {
  const { responseAttribution } = await loadAttribution()
  const first = response('accepted', '2026-10-20T08:00:00Z')
  const second = response('declined', '2026-10-21T08:00:00Z')
  for (const responses of [[first, second], [second, first]]) {
    assert.equal(responseAttribution('Declined', responses), 'client', 'the newest is the decline')
    assert.equal(responseAttribution('Accepted', responses), 'staff', 'the older acceptance is no longer what the status says')
  }
})

test('the newest response is found by instant, not by the text of the time or the order of the array', async () => {
  const { responseAttribution } = await loadAttribution()
  // 10:30+02:00 is 08:30Z: as text it sorts after 08:45Z, as an instant it is earlier.
  const earlier = response('accepted', '2026-10-20T10:30:00+02:00')
  const later = response('declined', '2026-10-20T08:45:00Z')
  for (const responses of [[earlier, later], [later, earlier]]) {
    assert.equal(responseAttribution('Declined', responses), 'client')
    assert.equal(responseAttribution('Accepted', responses), 'staff')
  }
})

test('two responses at the same instant: the one listed first (the query lists newest first) counts', async () => {
  const { responseAttribution } = await loadAttribution()
  const at = '2026-10-20T08:00:00Z'
  assert.equal(responseAttribution('Accepted', [response('accepted', at), response('declined', at)]), 'client')
  assert.equal(responseAttribution('Accepted', [response('declined', at), response('accepted', at)]), 'staff')
  assert.equal(responseAttribution('Declined', [response('declined', at), response('accepted', '2026-10-20T10:00:00+02:00')]), 'client', 'the same instant written two ways is a tie')
})

test('a time that cannot be read never makes a response the newest', async () => {
  const { responseAttribution } = await loadAttribution()
  const good = response('declined', '2026-10-20T08:00:00Z')
  const broken = response('accepted', 'not a time')
  for (const responses of [[broken, good], [good, broken]]) assert.equal(responseAttribution('Declined', responses), 'client')
  assert.equal(responseAttribution('Accepted', [broken]), 'client', 'on its own it is still the only response there is')
})

test('the attribution module is pure: no directive, no server-only, no alias import', () => {
  const source = read('features', 'quote-portal', 'response-attribution.ts')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m)
  assert.doesNotMatch(source, /server-only/)
  assert.doesNotMatch(source, /from\s+['"]@\//)
  assert.match(source, /export function responseAttribution\(/)
})

// ---- termsVersionLabels ----

test('termsVersionLabels turns each terms source into "layer v<version>", in order, ignoring the other keys', async () => {
  const { termsVersionLabels } = await loadAttribution()
  assert.deepEqual(
    termsVersionLabels([
      { layer: 'company', templateId: 'a', versionId: 'b', version: 3 },
      { layer: 'offering', version: 1 },
      { layer: 'category', version: 12 },
    ]),
    ['company v3', 'offering v1', 'category v12'],
  )
  assert.deepEqual(termsVersionLabels([]), [])
})

test('termsVersionLabels tolerates null, a non-array and malformed entries without throwing', async () => {
  const { termsVersionLabels } = await loadAttribution()
  for (const value of [null, undefined, {}, { layer: 'company', version: 1 }, 'company v1', 7, true]) assert.deepEqual(termsVersionLabels(value), [], `${JSON.stringify(value)} is not a list`)
  const malformed = [
    null,
    undefined,
    'company v1',
    5,
    [],
    {},
    { layer: 'company' },
    { version: 1 },
    { layer: '', version: 1 },
    { layer: '   ', version: 1 },
    { layer: 5, version: 1 },
    { layer: 'company', version: 'x' },
    { layer: 'company', version: null },
    { layer: 'company', version: Number.NaN },
    { layer: 'company', version: Number.POSITIVE_INFINITY },
  ]
  assert.deepEqual(termsVersionLabels(malformed), [], 'every malformed entry is left out')
  assert.deepEqual(termsVersionLabels([null, { layer: 'company', version: 2 }, 'junk', { layer: 'offering', version: 4 }]), ['company v2', 'offering v4'], 'and the good ones around them stay')
})

// ---- the query ----

test("listQuoteResponses reads the quote's responses through the member session, newest first, scoped to the organisation", () => {
  const source = query()
  assert.match(source, /export async function listQuoteResponses\(quoteId: string\): Promise<QuoteResponseRow\[\]>/)
  const body = source.slice(source.indexOf('export async function listQuoteResponses('))
  assert.match(body, /documentContext\(\)/, 'the signed-in member, not the service role')
  assert.match(body, /from\('quote_responses'\)/)
  assert.match(body, /\.eq\('quote_id', quoteId\)\s*\.eq\('organization_id', organization\.id\)\s*\.order\('decided_at', \{ ascending: false \}\)/, 'this quote, this organisation, newest first')
  assert.match(body, /if \(responses\.error\) throw responses\.error/)
  assert.doesNotMatch(source, /supabase\/admin|portal-client|createAdminSupabase/)
})

test('the responses query selects exactly the fields the panel shows: never the address, the browser or the consent wording', () => {
  const source = query()
  const body = source.slice(source.indexOf('export async function listQuoteResponses('))
  const select = body.match(/\.select\('([^']*)'\)/)
  assert.ok(select, 'a literal column list')
  const columns = select[1].split(',')
  assert.deepEqual(columns, [
    'id',
    'link_id',
    'decision',
    'decided_at',
    'signatory_name',
    'signatory_position',
    'signatory_organisation',
    'verified_email',
    'quote_number',
    'quote_version',
    'terms_sources',
    'snapshot_hash',
    'decline_reason',
    'decline_comments',
  ])
  for (const evidence of ['ip_address', 'user_agent', 'consent_text']) assert.ok(!columns.includes(evidence), `${evidence} is stored as evidence only`)
  assert.doesNotMatch(body, /select\('\*'\)|select\(\)/, 'no select-all')
  // The row type has the same fields and none of the evidence.
  const start = source.indexOf('export type QuoteResponseRow')
  assert.ok(start > -1, 'the row type is exported')
  const type = source.slice(start, source.indexOf('\n}', start))
  for (const evidence of ['ip_address', 'user_agent', 'consent_text']) assert.ok(!type.includes(evidence), `${evidence} is not on the row type`)
  assert.match(type, /decision: 'accepted' \| 'declined'/)
})

// ---- the panel, the recorded response ----

test('the panel never mentions the evidence columns, and renders every client-supplied value as text', () => {
  const source = panel()
  assert.doesNotMatch(source, /ip_address|user_agent|consent/i, 'the address, the browser and the consent wording are not shown to staff')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML/, 'a signatory name or a comment is hostile text')
  assert.doesNotMatch(source, /\.replace\(|\.split\(|<br\b/, 'line breaks come from CSS, not from rewriting the text')
})

test('the panel loads the responses with the links, after the draft check, and shows itself when a response exists', () => {
  const source = panel()
  assert.match(source, /import \{ listQuoteLinks, listQuoteResponses, listQuoteSends, type QuoteResponseRow \} from '\.\.\/queries\/list-quote-links'/)
  assert.match(source, /import \{ responseAttribution, termsVersionLabels \} from '\.\.\/response-attribution'/)
  assert.match(
    source,
    /const \[\{ links, replacesNumber, replacedBy \}, sends, responses\] = await Promise\.all\(\[listQuoteLinks\(quoteId\), listQuoteSends\(quoteId\), listQuoteResponses\(quoteId\)\]\)/,
  )
  assert.ok(source.indexOf("isDraftStatus('quote', bundle.record.status)") < source.indexOf('listQuoteResponses(quoteId)'), 'a draft reads nothing')
})

test('each response shows the decision, who decided, the time in South African time, the quote version, the terms versions and the whole snapshot hash', () => {
  const source = panel()
  assert.match(source, /responses\.map\(\(response\) =>/, 'newest first, as the query returns them')
  assert.match(source, /<h3 [^>]*>Response<\/h3>/, 'a Response block')
  assert.match(source, /<StatusBadge tone=\{DECISION_TONE\[response\.decision\]\}>\{DECISION_LABEL\[response\.decision\]\}<\/StatusBadge>/, 'the decision is a badge')
  for (const field of ['signatory_name', 'signatory_position', 'signatory_organisation', 'verified_email']) assert.match(source, new RegExp(`\\{response\\.${field}\\}`), `${field} is shown`)
  assert.match(source, /\{when\(response\.decided_at\)\}/, 'the time goes through the South African time helper')
  assert.match(source, /Quote version \{response\.quote_version\}/)
  assert.match(source, /termsVersionLabels\(response\.terms_sources\)/)
  assert.match(source, /Terms \{termsVersions\.join\(', '\)\}/, 'the terms versions are listed together')
  assert.match(source, /<code className="[^"]*\bbreak-all\b[^"]*\bfont-mono\b[^"]*">\{response\.snapshot_hash\}<\/code>/, 'the whole hash, in monospace, wrapping rather than overflowing')
  assert.doesNotMatch(source, /snapshot_hash\.(slice|substring|substr)\(/, 'never cut short')
})

test('a decline shows its reason and its comments as text with the line breaks kept, and an accept shows neither', () => {
  const source = panel()
  const gate = source.indexOf("response.decision === 'declined' ? (")
  assert.ok(gate > -1, 'the decline details sit behind the decision')
  assert.ok(source.indexOf('{response.decline_reason', gate) > gate, 'the reason is inside it')
  assert.ok(source.indexOf('{response.decline_comments}', gate) > gate, 'and so are the comments')
  assert.equal(source.split('response.decline_reason').length - 1, 1, 'the reason is shown once, behind the gate')
  assert.equal(source.split('response.decline_comments').length - 1, 2, 'the comments are tested for and shown, behind the gate')
  assert.match(source, /<p className="[^"]*\bwhitespace-pre-wrap\b[^"]*">\{response\.decline_comments\}<\/p>/, 'a text node in a paragraph that keeps its line breaks')
  assert.match(source, /<p className="[^"]*\bbreak-words\b[^"]*\bwhitespace-pre-wrap\b|<p className="[^"]*\bwhitespace-pre-wrap\b[^"]*\bbreak-words\b/, 'and a very long comment wraps')
})

test('a link that carries a decision shows when it was responded to, matched by link id', () => {
  const source = panel()
  assert.match(source, /new Map<string, QuoteResponseRow>\(responses\.map\(\(response\) => \[response\.link_id, response\]\)\)/, 'one response per link, found by the id of the link')
  assert.match(source, /responseByLink\.get\(link\.id\)/)
  assert.match(source, /Responded \{when\(responded\.decided_at\)\}/)
})

test('a status the client did not set shows "Marked by staff" and the sentence that no client response is on record', () => {
  const source = panel()
  assert.match(source, /const attribution = responseAttribution\(bundle\.record\.status, responses\)/)
  assert.match(source, /attribution === 'staff' \? \(/, 'only when the attribution says staff')
  assert.match(source, /'Marked by staff'/)
  assert.match(source, /'No client response is on record for this status\.'/)
  assert.equal(source.split('Marked by staff').length - 1, 1, 'written once')
  assert.equal(source.split('No client response is on record for this status.').length - 1, 1)
})
