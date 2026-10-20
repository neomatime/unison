import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Quote portal, slice 1, task 9: the send action mints a link and sends the branded email, but only for a Sent quote of
// an organisation that has switched the portal on. These are source guards (the action, the defaults and the
// preparation module are server-only and cannot be loaded by node --test) plus the one pure helper, the log-mode
// redaction. The end-to-end proof that a minted link opens the right quote was a throwaway harness (see the task report).

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const prepareSource = () => read('features', 'quote-portal', 'prepare-portal-email.ts')
const actionSource = () => read('features', 'documents', 'actions', 'email.ts')
const defaultsSource = () => read('features', 'documents', 'queries', 'get-email-defaults.ts')
const formSource = () => read('features', 'documents', 'components', 'email-document-form.tsx')

/** Ruling 2, written out the same way in the action and in the defaults. */
const SWITCH = "kind === 'quote' && bundle.record.status === 'Sent' && bundle.settings?.quote_portal_enabled === true"
const LOG_MODE = "return { error: 'Email is in log mode (EMAIL_TRANSPORT=log): the message was logged, not sent, and nothing was recorded.' }"

const count = (source: string, needle: string) => source.split(needle).length - 1

/** The text of one exported function, up to the next top-level export (or the end of the file). */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > -1, `${name} is exported as an async function`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

// ---- the preparation module ----

test('preparePortalEmail is server-only, reads the app address itself, and mints the link before it builds the template', () => {
  const source = prepareSource()
  assert.ok(source.startsWith("import 'server-only'"), 'server-only is the first line')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m, 'a plain server module, not an action file: its functions are not callable from a browser')
  assert.match(source, /readAppUrl\(process\.env\)/, 'it, not the action, reads the environment')
  const prepare = bodyOf(source, 'preparePortalEmail')
  const create = prepare.indexOf("rpc('create_quote_access_link'")
  const build = prepare.indexOf('quoteEmailTemplate(')
  assert.ok(create > -1, 'the link is made by the database function')
  assert.ok(build > -1, 'the branded template is built')
  assert.ok(create < build, 'the link is minted before the template is built')
  assert.match(prepare, /rpc\('create_quote_access_link', \{\s*p_quote_id: quoteId,\s*p_recipient_email: fields\.to,\s*p_recipient_name: bundle\.record\.contact_name \?\? null,?\s*\}\)/)
  assert.match(prepare, /documentErrorMessage\(/, 'a database refusal (QUOTE_ARCHIVED_LINK, QUOTE_EXPIRED, ...) becomes a plain message')
  // The new link's id is found by the hash of its token, under the member's own RLS, scoped to this quote.
  assert.match(source, /import \{ createHash \} from 'node:crypto'/)
  assert.match(prepare, /createHash\('sha256'\)\.update\(token\)\.digest\('hex'\)/)
  assert.match(prepare, /from\('quote_access_links'\)[\s\S]*?\.eq\('token_hash', [^)]+\)[\s\S]*?\.single\(\)/)
  assert.match(prepare, /from\('team_members'\)[\s\S]*?\.eq\('organization_id', organizationId\)[\s\S]*?\.eq\('user_id', senderUserId\)/, "the sender's role comes from their own team record")
  // The figures and words come from the pure mapping (tested in quote-portal-email-data.test.ts), fed the view the PDF uses.
  assert.match(source, /import \{ buildQuoteEmailData \} from '\.\/email-data'/)
  assert.match(prepare, /buildDocumentView\(\{ kind: 'quote', \.\.\.bundle \}\)/, 'the email shows what the PDF shows')
  assert.match(prepare, /buildQuoteEmailData\(\{\s*view,\s*record: bundle\.record,\s*personalNote: fields\.body,\s*reviewUrl,\s*pdfUrl: `\$\{reviewUrl\}\/pdf`,\s*assetBaseUrl: appUrl,\s*sender: \{ name: senderName, role \},\s*version,?\s*\}\)/)
  assert.ok(prepare.indexOf('buildQuoteEmailData(') < prepare.indexOf('quoteEmailTemplate('), 'the data is built, then rendered')
  assert.doesNotMatch(prepare, /totals\.|clientStatusLabel|formatDocumentDate|tax_amount|versionLabel/, 'no mapping is done here, so none can drift from the tested one')
  // Ruling 31: the portal's own read (portal-client, the service-role module) opens the new link; the link itself is
  // still made with the signed-in member's client, and this module never builds a service-role client of its own.
  assert.doesNotMatch(source, /supabase\/admin|createAdminSupabase/, 'no service-role client is built here')
  assert.match(prepare, /await db\.rpc\('create_quote_access_link'/, "the link is made with the signed-in member's client")
  assert.match(source, /^import \{ getPortalQuote \} from '@\/lib\/quote-portal\/portal-client'$/m, 'portal-client gives only the read the client makes')
})

test('the new link is opened with the real getPortalQuote before the email is built, and anything but open abandons it (Ruling 31)', () => {
  const prepare = bodyOf(prepareSource(), 'preparePortalEmail')
  const found = prepare.indexOf('linkId = found.data.id')
  const opened = prepare.indexOf('await getPortalQuote(token)')
  const built = prepare.indexOf('buildQuoteEmailData(')
  assert.equal(count(prepare, 'getPortalQuote('), 1, 'one read')
  assert.ok(found > -1 && opened > found, 'after the link id is known (so the link can be abandoned)')
  assert.ok(built > opened && prepare.indexOf('quoteEmailTemplate(') > opened, 'before the email is built')

  // The block from the read to the build: a not-open answer and a throw both abandon the link and send nothing.
  const tryOpen = prepare.lastIndexOf('try {', opened)
  const block = prepare.slice(tryOpen, prepare.lastIndexOf('try {', built))
  assert.ok(tryOpen > found, 'the read runs in its own try')
  assert.match(block, /if \(opened\.state !== 'open'\) \{[^}]*await abandonPortalLink\(db, linkId\)\s+return \{ error: NOT_SENT \}\s+\}/, 'a link that does not open is abandoned')
  assert.match(block, /\} catch \(error\) \{\s+console\.error\('\[quote-portal:email:open\]', error instanceof Error \? error\.message : 'unknown error'\)\s+await abandonPortalLink\(db, linkId\)\s+return \{ error: NOT_SENT \}\s+\}/, 'a read that throws is abandoned too, logged without the token')
  assert.equal(count(block, 'await abandonPortalLink(db, linkId)'), 2)
  assert.doesNotMatch(block, /quoteEmailTemplate|buildQuoteEmailData/, 'nothing is built on that path')
  // The version and the replaced number come from what the client will see.
  assert.match(block, /version = \{ version: opened\.version, replacesNumber: opened\.replaces_number \}/)
})

test('abandonPortalLink revokes the link as "email not sent" and never throws', () => {
  const abandon = bodyOf(prepareSource(), 'abandonPortalLink')
  assert.match(abandon, /^export async function abandonPortalLink\(db: any, linkId: string\): Promise<void>/)
  assert.match(abandon, /rpc\('revoke_quote_access_link', \{ p_link_id: linkId, p_reason: 'email not sent' \}\)/)
  assert.match(abandon, /try \{[\s\S]*\} catch/, 'a failure to revoke is logged, so the message the sender sees stays the same')
  assert.doesNotMatch(abandon, /\bthrow\b/)
})

test('a failure while building the email after the link was minted revokes the link and sends nothing', () => {
  const source = prepareSource()
  const prepare = bodyOf(source, 'preparePortalEmail')
  assert.match(source, /const NOT_SENT = 'The secure quotation link could not be added, so nothing was sent\. Please try again\.'/)
  const minted = prepare.indexOf('linkId = found.data.id')
  const tryBuild = prepare.lastIndexOf('try {', prepare.indexOf('buildQuoteEmailData('))
  assert.ok(minted > -1 && tryBuild > minted, 'the build runs in its own try, after the link id is known')
  const build = prepare.slice(tryBuild)
  assert.ok(build.indexOf('buildQuoteEmailData(') > -1 && build.indexOf('quoteEmailTemplate(') > -1, 'both the mapping and the template are inside it')
  assert.match(build, /^try \{[\s\S]*?return \{ template: quoteEmailTemplate\(data, fields\.subject\), linkId \}\s+\} catch \(error\) \{\s+(?:\/\/[^\n]*\s+)*console\.error\('\[quote-portal:email:build\]', error instanceof Error \? error\.message : 'unknown error'\)\s+await abandonPortalLink\(db, linkId\)\s+return \{ error: NOT_SENT \}\s+\}/, 'a throw revokes the minted link, then returns the not-added error')
  assert.doesNotMatch(source, /send-email|sendEmail\(/, 'nothing here can send: the action sends only when this returns a template')
})

test('the raw token is never logged, thrown, returned or put into a message', () => {
  const source = prepareSource()
  for (const call of source.match(/console\.\w+\([^\n]*/g) ?? []) {
    assert.doesNotMatch(call, /\btoken\b|reviewUrl|pdfUrl|template/, `a log line must not carry the token: ${call}`)
  }
  for (const line of source.split('\n')) {
    const returned = line.match(/\breturn\b(.*)$/)?.[1] ?? ''
    assert.doesNotMatch(returned, /\btoken\b/, `nothing returned carries the token: ${line.trim()}`)
    assert.doesNotMatch(line, /\bthrow\b.*\btoken\b/, `nothing thrown carries the token: ${line.trim()}`)
  }
  assert.equal(count(source, '${token}'), 1, 'the token is written in exactly one place: the review URL')
  assert.match(source, /`\$\{appUrl\}\/q\/\$\{token\}`/)
  assert.match(source, /`\$\{reviewUrl\}\/pdf`/)
})

// ---- the action ----

test('the action mints the link after every check and before the one send, and only under Ruling 2', () => {
  const source = actionSource()
  const pdf = source.indexOf('> MAX_EMAIL_PDF_BYTES')
  const prepare = source.indexOf('preparePortalEmail(')
  const send = source.indexOf('await sendEmail(')
  assert.ok(pdf > -1 && prepare > -1 && send > -1)
  assert.ok(pdf < prepare && prepare < send, 'preparePortalEmail( comes after the PDF size check and before the send')
  assert.equal(count(source, 'preparePortalEmail('), 1)
  assert.equal(count(source, SWITCH), 1, 'the switch is the Sent status and the organisation setting the action already loaded')
  assert.ok(source.indexOf(SWITCH) < prepare, 'the condition guards the call')
  const between = source.slice(prepare, send)
  assert.match(between, /if \(portal && 'error' in portal\) return \{ error: portal\.error \}/, 'a link that could not be made stops the send')
  assert.equal(count(source, 'await sendEmail('), 1, 'exactly one send')
  assert.equal(count(source, "rpc('record_document_email'"), 1, 'exactly one record')
  assert.doesNotMatch(source, /process\.env/, 'the environment is read by the preparation module, not the action')
})

test('with the switch off the action sends the plain email exactly as before', () => {
  const source = actionSource()
  assert.match(source, /template: portal \? portal\.template : \{ subject: fields\.subject, text: fields\.body, html: emailHtml\(fields\.body\) \},/, 'the plain template is the one sent today')
  assert.match(source, /to: fields\.to,\s+template:[^\n]+\s+replyTo: user\.email \?\? undefined,\s+attachments: \[\{ filename: made\.filename, contentType: 'application\/pdf', content: made\.bytes \}\],/, 'the PDF stays attached and replies still go to the sender')
})

test('the action abandons the link when the mail server refuses the message and in log mode', () => {
  const source = actionSource()
  assert.equal(count(source, 'abandonPortalLink('), 2, 'once in the catch, once for log mode')
  // The catch of the send, not the earlier one around the PDF.
  const catchBlock = source.slice(source.indexOf('} catch (error) {', source.indexOf('await sendEmail(')), source.indexOf('if (!delivered)'))
  assert.ok(catchBlock.startsWith('} catch (error) {'))
  const abandon = catchBlock.indexOf('if (portal) await abandonPortalLink(db, portal.linkId)')
  assert.ok(abandon > -1, 'a failed send revokes the link it would have carried')
  assert.ok(abandon < catchBlock.indexOf('return {'), 'before either message is returned')
  assert.match(source, new RegExp(`if \\(!delivered\\) \\{\\s+if \\(portal\\) await abandonPortalLink\\(db, portal\\.linkId\\)\\s+${LOG_MODE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\}`), 'log mode revokes the link too, with the same message')
  // The messages the sender sees are unchanged.
  assert.match(catchBlock, /if \(error instanceof MissingEnvError\) return \{ error: 'Email sending is not set up on this server yet\.' \}/)
  assert.match(catchBlock, /return \{ error: 'The mail server did not accept the message\. It may not have been sent; check Emails sent and your mailbox before trying again\.' \}/)
})

test('the send is recorded with the subject actually sent (the branded template tidies it), and still once', () => {
  const source = actionSource()
  assert.equal(count(source, "rpc('record_document_email'"), 1)
  const record = source.slice(source.indexOf("rpc('record_document_email'"))
  assert.match(record, /^rpc\('record_document_email', \{\s+p_kind: kind,\s+p_id: id,\s+p_to: fields\.to,\s+p_subject: portal \? portal\.template\.subject : fields\.subject,\s+p_body: fields\.body,/)
})

// ---- the defaults and the form ----

test('the email section remounts the form when its mode changes, so a stale form cannot keep the other defaults', () => {
  const source = read('features', 'documents', 'components', 'email-section.tsx')
  assert.match(source, /<EmailDocumentForm key=\{String\(defaults\.portal\)\} kind=\{kind\} id=\{id\} defaults=\{defaults\} \/>/)
})


test('the email defaults report portal under the same condition as the action, with the default note as the body', () => {
  const source = defaultsSource()
  assert.match(source, /Promise<\{ to: string; subject: string; body: string; portal: boolean \}>/)
  assert.equal(count(source, SWITCH), 1, 'the same condition, written the same way')
  assert.match(source, /import \{ EMAIL_DEFAULT_NOTE \} from '\.\.\/\.\.\/quote-portal\/copy'/)
  assert.match(source, /body: portal \? EMAIL_DEFAULT_NOTE : defaultEmailMessage\(view, resolveDisplayName\(user\)\)/, 'the template adds the greeting and signature, so the note is the default wording alone')
  assert.match(source, /subject: defaultEmailSubject\(view\)/, 'the subject is unchanged')
  assert.match(source, /return \{ to, subject: defaultEmailSubject\(view\), body: [^\n]+, portal \}/)
})

test('the company settings type carries the optional portal switch', () => {
  assert.match(read('features', 'documents', 'types.ts'), /\n  quote_portal_enabled\?: boolean\n/)
})

test('the form calls the message a personal note and says the link and the PDF are added when the portal is on', () => {
  const source = formSource()
  assert.match(source, /defaults: \{ to: string; subject: string; body: string; portal: boolean \}/)
  assert.match(source, /label=\{defaults\.portal \? 'Personal note' : 'Message'\}/)
  assert.match(source, /\{defaults\.portal\s*\? 'The secure quotation link and the PDF are added for you\. Replies go to your own email address\.'\s*: 'The PDF is attached\. Replies go to your own email address\.'\}/)
  assert.doesNotMatch(source, /server-only|lib\/email|quote-portal/, 'a client component imports no server code')
})

// ---- log mode (Ruling 23) ----

test('redactPortalTokens replaces every portal token in a logged message and nothing else', async () => {
  const { redactPortalTokens } = await import('../../lib/quote-portal/token.ts')
  assert.equal(typeof redactPortalTokens, 'function', 'redactPortalTokens is exported from the token module')
  const token = randomBytes(32).toString('base64url')
  const other = randomBytes(32).toString('base64url')
  assert.equal(redactPortalTokens(`Review quotation:\nhttps://unison.example/q/${token}\n`), 'Review quotation:\nhttps://unison.example/q/redacted\n')
  assert.equal(redactPortalTokens(`https://unison.example/q/${token}/pdf`), 'https://unison.example/q/redacted/pdf')
  const both = redactPortalTokens(`a /q/${token} b /q/${other}/pdf c`)
  assert.equal(both, 'a /q/redacted b /q/redacted/pdf c')
  assert.ok(!both.includes(token) && !both.includes(other))
  // Inside the JSON the log prints, too.
  const logged = redactPortalTokens(JSON.stringify({ subject: 'Quote', text: `Open https://x.example/q/${token}` }, null, 2))
  assert.ok(!logged.includes(token))
  assert.match(logged, /https:\/\/x\.example\/q\/redacted/)
  // Not a token: left as it was.
  for (const untouched of ['', 'Please find attached quote HMK-Q-2026-00001.', `/q/${'A'.repeat(42)}`, `/quotes/${token}`, `/Q/${token}`, `q/${token}`]) {
    assert.equal(redactPortalTokens(untouched), untouched, untouched)
  }
})

test('log mode prints the message through the redaction and still sends nothing', () => {
  const source = read('lib', 'email', 'send-email.ts')
  assert.match(source, /import \{ redactPortalTokens \} from '@\/lib\/quote-portal\/token'/)
  const logBlock = source.slice(source.indexOf("if (process.env.EMAIL_TRANSPORT === 'log')"), source.indexOf('return { delivered: false }'))
  assert.match(logBlock, /console\.log\('\[email:log\]', redactPortalTokens\(JSON\.stringify\(/, 'what is printed is redacted')
  assert.equal(count(source, 'console.'), 1, 'nothing else prints the message')
  assert.ok(source.indexOf('return { delivered: false }') < source.indexOf('await sendMimeViaGraph('), 'log mode returns before anything is sent')
  assert.ok(source.indexOf('await sendMimeViaGraph(') < source.indexOf('return { delivered: true }'), 'delivered only after the mail server accepts')
})
