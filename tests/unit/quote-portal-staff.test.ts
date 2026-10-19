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

const CREATED = '2026-10-19T08:00:00Z'
const created = new Date(CREATED).getTime()
const sentAt = (offsetMs: number) => new Date(created + offsetMs).toISOString()

test('an email to the link recipient sent after the link was made confirms it', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const row = { recipient_email: 'client@example.com', created_at: CREATED }
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(2_000) }]), true)
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(0) }]), true, 'at the same instant')
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(3 * 60 * 60 * 1000) }]), true, 'a later email to the same person still counts')
})

test('the address is compared without regard to case or surrounding spaces', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const row = { recipient_email: 'client@example.com', created_at: CREATED }
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'Client@Example.COM', sent_at: sentAt(1_000) }]), true)
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: '  client@example.com ', sent_at: sentAt(1_000) }]), true)
  assert.equal(isLinkEmailConfirmed({ recipient_email: 'Client@Example.com', created_at: CREATED }, [{ to_address: 'client@example.com', sent_at: sentAt(1_000) }]), true)
})

test('an email up to one minute before the link was made counts, one millisecond more does not', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const row = { recipient_email: 'client@example.com', created_at: CREATED }
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(-60_000) }]), true, 'exactly one minute before')
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(-30_000) }]), true)
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(-60_001) }]), false, 'one millisecond past the tolerance')
})

test('an earlier email to the same address, or an email to someone else, does not confirm the link', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const row = { recipient_email: 'client@example.com', created_at: CREATED }
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com', sent_at: sentAt(-24 * 60 * 60 * 1000) }]), false, 'yesterday')
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'someone.else@example.com', sent_at: sentAt(1_000) }]), false)
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'client@example.com.au', sent_at: sentAt(1_000) }]), false, 'a longer address is not the same address')
  assert.equal(isLinkEmailConfirmed(row, [{ to_address: 'xclient@example.com', sent_at: sentAt(1_000) }]), false)
})

test('with no emails at all, or among several of which one fits, the answer follows the one that fits', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  const row = { recipient_email: 'client@example.com', created_at: CREATED }
  assert.equal(isLinkEmailConfirmed(row, []), false, 'nothing was emailed')
  assert.equal(
    isLinkEmailConfirmed(row, [
      { to_address: 'other@example.com', sent_at: sentAt(500) },
      { to_address: 'client@example.com', sent_at: sentAt(-3_600_000) },
      { to_address: 'client@example.com', sent_at: sentAt(900) },
    ]),
    true,
  )
})

test('a time that cannot be read confirms nothing', async () => {
  const { isLinkEmailConfirmed } = await loadState()
  assert.equal(isLinkEmailConfirmed({ recipient_email: 'client@example.com', created_at: 'garbage' }, [{ to_address: 'client@example.com', sent_at: sentAt(1_000) }]), false)
  assert.equal(isLinkEmailConfirmed({ recipient_email: 'client@example.com', created_at: CREATED }, [{ to_address: 'client@example.com', sent_at: 'garbage' }]), false)
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
  assert.match(source, /isLinkEmailConfirmed\(link, sends\)/)
  assert.match(source, /link\.recipient_email/)
  assert.match(source, /Created \{when\(link\.created_at\)\}/)
  assert.match(source, /Expires \{when\(link\.expires_at\)\}/)
  assert.match(source, /'Emailed' : 'Not confirmed sent'/, 'an active link is not assumed to have been emailed')
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
