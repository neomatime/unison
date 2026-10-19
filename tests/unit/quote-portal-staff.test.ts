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

/// ---- isLinkEmailConfirmed ----
// Ruling 26: an email confirms at most one link, the latest link to the same address that was made at or before the email
// was sent (plus a minute). So a later retry's email can never confirm the earlier, abandoned link.

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

test('the one-minute tolerance: an email sent a minute before its link was made still pairs, a second more does not', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const at = (linkOffset: number) => {
    const link = aLink('link', linkOffset)
    return isLinkEmailConfirmed(link, [link], [aMail(0)])
  }
  assert.equal(at(60 * SECOND), true, 'the email is exactly 60 seconds before the link')
  assert.equal(at(30 * SECOND), true)
  assert.equal(at(61 * SECOND), false, 'the email is 61 seconds before the link')
  assert.equal(at(60 * SECOND + 1), false, 'one millisecond past the tolerance')
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

test('an email sent long before the link was made never confirms it', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const link = aLink('link', 24 * HOUR)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(0)]), false, 'yesterday')
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(24 * HOUR - 61 * SECOND)]), false)
  assert.equal(isLinkEmailConfirmed(link, [link], [aMail(24 * HOUR - 59 * SECOND)]), true, 'inside the minute it pairs')
})

test('with no emails at all, or a link that is not among the links, nothing is confirmed', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const link = aLink('link', 0)
  assert.equal(isLinkEmailConfirmed(link, [link], []), false, 'nothing was emailed')
  assert.equal(isLinkEmailConfirmed(link, [], [aMail(SECOND)]), false)
})

test('times are compared as instants, whatever offset they were written with', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  // 10:30+02:00 is 08:30Z. As text it sorts after 08:31Z; as an instant it is a minute earlier.
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
  assert.doesNotMatch(source, /token/i, 'the query never names a token or a hash column')
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

test('with no links the panel says something only when the portal switch is on, and nothing at all when it is off', () => {
  const source = panel()
  assert.match(source, /quote_portal_enabled === true/, 'the switch is read from the same company settings the email action uses')
  assert.match(source, /if \(links\.length === 0 && !switchOn\) return null/, 'switch off and no links: nothing')
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

test('the supersede chain says Replaces and Replaced by', () => {
  const source = panel()
  assert.match(source, /Replaces \{replacesNumber\}/)
  assert.match(source, /Replaced by \{replacedBy\.join\(', '\)\}/)
})

test('the panel never prints or links a portal address, a token or a hash, and uses no router link', () => {
  const source = panel()
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
