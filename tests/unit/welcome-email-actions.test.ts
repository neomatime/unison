import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildWelcomeEmail } from '../../features/documents/welcome-email.ts'
import { loadWelcomeDocuments, welcomeDocumentsFailure, welcomeDocumentsProblem } from '../../features/documents/welcome-documents.ts'

// The HIMARK Welcome Email replaces the plain invoice email for the first invoice of a billing plan (accept to invoice, stage 1).
// The email action, the approval action, the defaults, the form and the preparation module are server code that `node --test`
// cannot load, so they are guarded by their source, in the house style of billing-plan-actions.test.ts; the pure part that decides
// what goes out (buildWelcomeEmail) is run for real. Git on Windows may check files out with CRLF; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const FILES = {
  action: ['features', 'documents', 'actions', 'email.ts'],
  approve: ['features', 'documents', 'actions', 'billing-plan.ts'],
  prepare: ['features', 'documents', 'prepare-welcome-email.ts'],
  build: ['features', 'documents', 'welcome-email.ts'],
  documents: ['features', 'documents', 'welcome-documents.ts'],
  copy: ['features', 'documents', 'welcome-email-copy.ts'],
  rule: ['features', 'documents', 'queries', 'is-welcome-invoice.ts'],
  template: ['lib', 'email', 'templates', 'welcome.ts'],
  defaults: ['features', 'documents', 'queries', 'get-email-defaults.ts'],
  form: ['features', 'documents', 'components', 'email-document-form.tsx'],
} as const
const NEW_FILES = ['prepare', 'build', 'documents', 'copy', 'rule', 'template'] as const

const action = () => read(...FILES.action)
const approve = () => read(...FILES.approve)
const prepare = () => read(...FILES.prepare)
const count = (source: string, needle: string) => source.split(needle).length - 1
const RPC = /\bdb\s*\.\s*rpc\(\s*'([a-z_]+)'/g
const rpcNames = (source: string) => [...source.matchAll(RPC)].map((match) => match[1])

/** One exported function's text: from its signature to the next export (or the end of the file). */
function body(source: string, name: string): string {
  const start = [`export async function ${name}(`, `export function ${name}(`].map((signature) => source.indexOf(signature)).find((at) => at > -1) ?? -1
  assert.ok(start > -1, `${name} must be exported`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

// ---- the rule: only the first invoice of a billing plan -------------------------------------------------------------

test('the welcome rule is written once: an invoice whose plan item is of kind first, found by the existing plan link', () => {
  const source = read(...FILES.rule)
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /import \{ getPlanLink \} from '\.\/get-plan-link'/, 'the app\'s own way of finding the plan item')
  assert.match(source, /export async function isWelcomeInvoice\(kind: DocumentKind, invoiceId: string\): Promise<boolean> \{/)
  const text = body(source, 'isWelcomeInvoice')
  assert.match(text, /if \(kind !== 'invoice'\) return false/, 'a quote is never a welcome')
  assert.match(text, /const link = await getPlanLink\(invoiceId\)/)
  assert.match(text, /return link\?\.kind === 'first'/, 'a monthly invoice (kind due), a quote and an invoice with no plan are not')
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc|from)\(|createClient\(|supabase\/admin|process\.env/, 'a read through the plan link, nothing else')
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m)
  // Nothing else decides it: the other files ask this one.
  for (const name of ['action', 'prepare', 'defaults', 'form', 'approve'] as const) assert.doesNotMatch(read(...FILES[name]), /kind === 'first'/, `${name} does not re-decide the rule`)
  assert.equal(count(prepare(), 'isWelcomeInvoice('), 1)
  assert.equal(count(read(...FILES.defaults), 'isWelcomeInvoice('), 1)
})

// ---- the email action ------------------------------------------------------------------------------------------

test('the email action prepares the welcome after every check and before the one send, for an invoice only', () => {
  const source = action()
  const pdf = source.indexOf('> MAX_EMAIL_PDF_BYTES')
  const portal = source.indexOf("if (portal && 'error' in portal) return { error: portal.error }")
  const welcome = source.indexOf('await prepareWelcomeEmail(')
  const stop = source.indexOf("if (welcome && 'error' in welcome) return { error: welcome.error }")
  const send = source.indexOf('await sendEmail(')
  assert.ok(pdf > -1 && portal > pdf && welcome > portal && stop > welcome && send > stop, 'size check, portal, welcome, its stop, then the send')
  assert.equal(count(source, 'prepareWelcomeEmail('), 1)
  assert.match(source, /const welcome = kind === 'invoice' \? await prepareWelcomeEmail\(\{ invoiceId: id, bundle, invoice: \{ filename: made\.filename, bytes: made\.bytes \} \}\) : null/, 'an invoice only, with the PDF the action already made')
  assert.match(source, /import \{ prepareWelcomeEmail \} from '\.\.\/prepare-welcome-email'/)
  // Everything the welcome needs is read between the checks and the send; the send is still the only one, and so is the record.
  assert.equal(count(source, 'await sendEmail('), 1, 'exactly one send')
  assert.equal(count(source, "rpc('record_document_email'"), 1, 'exactly one record')
  assert.doesNotMatch(source, /process\.env|supabase\/admin|loadWelcomeDocuments|welcome-documents/, 'the action reads neither the environment nor the files: the preparation module does')
})

test('a welcome that cannot be prepared (a document that cannot be read, a size over the cap, a plan that cannot be checked) returns its words before anything is sent', () => {
  const source = action()
  const stop = source.indexOf("if (welcome && 'error' in welcome) return { error: welcome.error }")
  assert.ok(stop > -1 && stop < source.indexOf('await sendEmail('), 'the return comes before the send')
  assert.doesNotMatch(source.slice(source.indexOf('await prepareWelcomeEmail('), stop), /sendEmail|record_document_email/, 'nothing is sent or recorded on the way')
})

test('the welcome sends three attachments, the invoice first, with the recipient and the reply-to as they were; the plain email is the text it was', () => {
  const source = action()
  assert.match(source, /to: fields\.to,\n\s+template: portal \? portal\.template : welcome \? welcome\.template : \{ subject: fields\.subject, text: fields\.body, html: emailHtml\(fields\.body\) \},\n\s+replyTo: user\.email \?\? undefined,\n\s+attachments: welcome \? welcome\.attachments : \[\{ filename: made\.filename, contentType: 'application\/pdf', content: made\.bytes \}\],/)
  // The two plain-path expressions are character for character what they were.
  assert.ok(source.includes("{ subject: fields.subject, text: fields.body, html: emailHtml(fields.body) }"))
  assert.ok(source.includes("[{ filename: made.filename, contentType: 'application/pdf', content: made.bytes }]"))
})

test('the portal quote branch is untouched', () => {
  const source = action()
  const SWITCH = "kind === 'quote' && bundle.record.status === 'Sent' && bundle.settings?.quote_portal_enabled === true"
  assert.equal(count(source, SWITCH), 1)
  assert.match(source, /\? await preparePortalEmail\(\{ db, quoteId: id, bundle, fields, senderName: resolveDisplayName\(user\), senderUserId: user\.id, organizationId: organization\.id \}\)\n\s+: null\n\s+if \(portal && 'error' in portal\) return \{ error: portal\.error \}/)
  assert.equal(count(source, 'abandonPortalLink('), 2, 'the link is still revoked in the catch and in log mode')
  assert.ok(source.includes('if (portal) await abandonPortalLink(db, portal.linkId)'))
  assert.ok(source.indexOf('await preparePortalEmail(') < source.indexOf('await prepareWelcomeEmail('), 'the portal is prepared first; a quote never reaches the welcome')
})

test('the record is written once, exactly as now for the invoice (recipient, its hash and size), with the welcome\'s subject and its message plus the attachment listing', () => {
  const source = action()
  const record = source.slice(source.indexOf("rpc('record_document_email'"))
  assert.match(
    record,
    /^rpc\('record_document_email', \{\n\s+p_kind: kind,\n\s+p_id: id,\n\s+p_to: fields\.to,\n\s+p_subject: portal \? portal\.template\.subject : welcome \? welcome\.template\.subject : fields\.subject,\n\s+p_body: welcome \? welcome\.recordBody : fields\.body,\n\s+p_sha256: createHash\('sha256'\)\.update\(made\.bytes\)\.digest\('hex'\),\n\s+p_bytes: made\.bytes\.length,\n\s+\}\)/,
    'the hash and byte count are the invoice PDF\'s, as before',
  )
  assert.deepEqual(rpcNames(source), ['record_document_email'], 'no new rpc')
  // Only "sent" once the mail server accepted the message: the record still comes after the send and the delivered check.
  assert.ok(source.indexOf('await sendEmail(') < source.indexOf('if (!delivered)') && source.indexOf('if (!delivered)') < source.indexOf("rpc('record_document_email'"))
  assert.ok(source.includes('return { success: `Sent to ${fields.to}.` }'), 'the success sentence is the one it was')
})

// ---- the preparation module ------------------------------------------------------------------------------------

test('the preparation module is server-only, asks the rule first, then reads both documents, and only then builds the email', () => {
  const source = prepare()
  assert.match(source, /^import 'server-only'/)
  assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m, 'a plain server module: its function is not callable from a browser')
  const text = body(source, 'prepareWelcomeEmail')
  const rule = text.indexOf('await isWelcomeInvoice(')
  const nothing = text.indexOf('if (!welcome) return null')
  const load = text.indexOf('await loadWelcomeDocuments()')
  const build = text.indexOf('buildWelcomeEmail(')
  assert.ok(rule > -1 && nothing > rule && load > nothing && build > load, 'rule, null for any other document, load the files, build')
  assert.match(text, /isWelcomeInvoice\('invoice', input\.invoiceId\)/)
  assert.match(text, /contactName: input\.bundle\.record\.contact_name/, 'the greeting is the invoice\'s own contact name')
  assert.match(text, /appUrl = readAppUrl\(process\.env\)\.replace\(\/\\\/\+\$\/, ''\)/, 'the module, not the action, reads the app address')
  assert.match(text, /documents,\s+appUrl,\s+invoice: input\.invoice,/)
  assert.doesNotMatch(source, /sendEmail|send-email|\.rpc\(|\.from\(|supabase/, 'it prepares; it sends and records nothing')
})

test('a plan that cannot be checked and a document that cannot be read each return plain words and "Nothing was sent."', () => {
  const text = body(prepare(), 'prepareWelcomeEmail')
  const check = text.slice(text.indexOf('try {'), text.indexOf('if (!welcome) return null'))
  assert.match(check, /catch \(error\) \{\s+console\.error\('\[documents:welcome:plan\]'/, 'logged')
  assert.match(check, /return \{ error: 'The billing plan of this invoice could not be checked, so nothing was sent\. Please try again\.' \}/)
  const load = text.slice(text.indexOf('await loadWelcomeDocuments()') - 60, text.indexOf('buildWelcomeEmail('))
  assert.match(load, /catch \(error\) \{\s+console\.error\('\[documents:welcome:documents\]', error\)\s+return \{ error: `\$\{welcomeDocumentsFailure\(error\)\} Nothing was sent\.` \}\s+\}/, 'logged for support, then the plain words')
  assert.match(text, /return \{ error: 'Email sending is not set up on this server yet\.' \}/, 'the email action\'s own sentence for a missing address')
  assert.match(text, /return built\b/, 'what buildWelcomeEmail says is returned as it is')
})

test('the pure builder makes the three attachments, the size check and the record text; it sends nothing', () => {
  const source = read(...FILES.build)
  assert.doesNotMatch(source, /^import 'server-only'|^\s*['"]use (server|client)['"]|from\s+['"]@\//m, 'relative imports only, so node --test can load it')
  assert.doesNotMatch(source.replace(/^\s*(\/\/|\*).*$/gm, ''), /sendEmail|process\.env|supabase|\.rpc\(/, 'no sending, no environment, no database')
  assert.doesNotMatch(source, /sendEmail|process\.env|supabase|\.rpc\(/)
  const text = body(source, 'buildWelcomeEmail')
  const attachments = text.indexOf('welcomeAttachments(')
  const cap = text.indexOf('attachmentsTooLarge(')
  const template = text.indexOf('welcomeEmailTemplate(')
  const recordBody = text.indexOf('welcomeRecordBody(')
  assert.ok(attachments > -1 && cap > attachments && template > cap && recordBody > template, 'attachments, size cap, template, record text')
})

// ---- the pure builder, run for real ----------------------------------------------------------------------------

const INVOICE = { filename: 'HMK-INV-2026-00007.pdf', bytes: Buffer.from('%PDF-1.7 the invoice') }
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

test('the builder greets the invoice\'s contact, and a missing or odd contact gets the approved default', async () => {
  const documents = await loadWelcomeDocuments()
  const greeting = (contactName: unknown) => {
    const built = buildWelcomeEmail({ contactName, appUrl: 'https://unison.example', invoice: INVOICE, documents })
    assert.ok(!('error' in built), 'built')
    return built.template.text.split('\n')[0]
  }
  assert.equal(greeting('Thandi Nkosi'), 'Dear Thandi Nkosi,')
  assert.equal(greeting('  Thandi  \n Nkosi '), 'Dear Thandi Nkosi,')
  for (const contactName of [null, undefined, '', '   ', 42, {}, ['Thandi']]) assert.equal(greeting(contactName), 'Dear Valued Client,', String(contactName))
})

test('the builder returns the subject, three attachments in order and a record that lists them with their hashes', async () => {
  const documents = await loadWelcomeDocuments()
  const built = buildWelcomeEmail({ contactName: 'Thandi Nkosi', appUrl: 'https://unison.example/', invoice: INVOICE, documents })
  assert.ok(!('error' in built))
  assert.equal(built.template.subject, 'Welcome to HIMARK | Your Invoice & Next Steps')
  assert.deepEqual(built.attachments.map((attachment) => attachment.filename), ['HMK-INV-2026-00007.pdf', 'HIMARK Welcome Letter.pdf', 'HIMARK Your Next Steps.pdf'])
  assert.ok(built.template.html.includes('src="https://unison.example/brand/email-wordmark.png"'), 'the images load from the app address, without a double slash')
  assert.ok(built.recordBody.startsWith(`${built.template.text}\n\nAttachments:\n`))
  const lines = built.recordBody.split('\n').slice(-3)
  assert.equal(lines[0], `HMK-INV-2026-00007.pdf | ${INVOICE.bytes.length} bytes | sha256 ${sha(INVOICE.bytes)}`)
  assert.equal(lines[1], `HIMARK Welcome Letter.pdf | 121686 bytes | sha256 0c00abf67aebffafc2db974badccd75329e5a74936fc51ad3fd831bb8febc3ae`)
  assert.equal(lines[2], `HIMARK Your Next Steps.pdf | 112155 bytes | sha256 5c4e390d1f9621beb813b2caed0080eda4d8bdf4ac337460fc6028ab658fdffd`)
  assert.ok(built.recordBody.length < 10_000)
})

test('the builder refuses a total over 3,000,000 bytes with plain words, and a bad app address without throwing', async () => {
  const documents = await loadWelcomeDocuments()
  const room = 3_000_000 - documents[0].bytes.length - documents[1].bytes.length
  const fits = buildWelcomeEmail({ contactName: null, appUrl: 'https://unison.example', invoice: { filename: 'x.pdf', bytes: Buffer.alloc(room, 1) }, documents })
  assert.ok(!('error' in fits), 'exactly 3,000,000 bytes in all fits')
  const over = buildWelcomeEmail({ contactName: null, appUrl: 'https://unison.example', invoice: { filename: 'x.pdf', bytes: Buffer.alloc(room + 1, 1) }, documents })
  assert.ok('error' in over)
  assert.match(over.error, /too large to email in one message\. Nothing was sent\./)
  const bad = buildWelcomeEmail({ contactName: null, appUrl: 'javascript:alert(1)', invoice: INVOICE, documents })
  assert.ok('error' in bad)
  assert.equal(bad.error, 'The HIMARK Welcome Email could not be prepared, so nothing was sent. Please try again.')
})

test('the failure sentence of the document loader is its own words for a known fault and a safe sentence for anything else', async () => {
  assert.equal(await welcomeDocumentsProblem(), null, 'the real files are fine')
  const missing = await welcomeDocumentsProblem(join(process.cwd(), 'no-such-root'))
  assert.equal(missing, 'The HIMARK Welcome Letter could not be found. Ask support to restore public/brand/documents/Welcome Letter.pdf.')
  const generic = welcomeDocumentsFailure(new Error("ENOENT: no such file, open 'C:\\secret\\path'"))
  assert.equal(generic, 'The HIMARK welcome documents could not be read. Please try again or ask support.')
  assert.doesNotMatch(generic, /ENOENT|secret/)
})

// ---- the approval ----------------------------------------------------------------------------------------------

test('approving reads the two documents after the permission and the hourly cap and before the invoice is numbered, and stops with plain words if it cannot', () => {
  const text = body(approve(), 'approveFirstInvoiceAction')
  const permission = text.indexOf("roleHasPermission(role, 'company.manage')")
  const cap = text.indexOf('>= HOURLY_EMAIL_CAP')
  const problem = text.indexOf('await welcomeDocumentsProblem()')
  const rpcAt = text.indexOf("rpc('approve_first_invoice'")
  assert.ok(permission > -1 && cap > permission && problem > cap && rpcAt > problem, 'permission, cap, documents, then the approval')
  assert.match(text, /const welcomeProblem = await welcomeDocumentsProblem\(\)\n\s+if \(welcomeProblem\) return \{ error: `\$\{welcomeProblem\} Nothing was approved or sent\.` \}/)
  assert.equal(count(text, 'welcomeDocumentsProblem('), 1)
  assert.doesNotMatch(text.slice(problem, rpcAt), /revalidateDocumentPages|rpc\(/, 'nothing changed, so nothing is refreshed')
  assert.match(approve(), /import \{ welcomeDocumentsProblem \} from '\.\.\/welcome-documents'/)
})

test('the approval still has one rpc, only the approval; its other sentences and the hand-over to the email action are as they were', () => {
  const source = approve()
  const text = body(source, 'approveFirstInvoiceAction')
  assert.deepEqual(rpcNames(text), ['approve_first_invoice'])
  assert.deepEqual(rpcNames(source), ['approve_first_invoice', 'create_plan_item_invoice', 'billing_plan_set_state'], 'no new rpc in the module')
  assert.equal((text.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 2, 'the hourly count and the approval: no other database call')
  assert.match(text, /if \(sent\?\.success\) return \{ success: `Invoice \$\{number\} approved and emailed to \$\{defaults\.to\}\.` \}/)
  for (const field of ['to', 'subject', 'body']) assert.match(text, new RegExp(`email\\.set\\('${field}', defaults\\.${field}\\)`), `${field} is handed over as it was`)
  assert.match(text, /const sent = await emailDocumentAction\('invoice', invoiceId, undefined, email\)/)
})

// ---- the defaults and the form ---------------------------------------------------------------------------------

test('the email defaults say welcome for the first invoice of a plan, with the fixed subject and no editable message', () => {
  const source = read(...FILES.defaults)
  assert.match(source, /Promise<\{ to: string; subject: string; body: string; portal: boolean; welcome: boolean \}>/)
  assert.match(source, /const welcome = await isWelcomeInvoice\(kind, String\(bundle\.record\.id\)\)/)
  assert.match(source, /import \{ isWelcomeInvoice \} from '\.\/is-welcome-invoice'/)
  assert.match(source, /import \{ WELCOME_EMAIL_SUBJECT \} from '\.\.\/welcome-email-copy'/)
  assert.match(source, /if \(welcome\) return \{ to, subject: WELCOME_EMAIL_SUBJECT, body: '', portal: false, welcome: true \}/)
  assert.match(source, /return \{ to, subject: defaultEmailSubject\(view\), body: portal \? EMAIL_DEFAULT_NOTE : defaultEmailMessage\(view, resolveDisplayName\(user\)\), portal, welcome: false \}/, 'every other document: the defaults it had')
  assert.ok(source.indexOf('if (welcome) return') > source.indexOf('if (isValidEmailAddress(contact)) to = contact'), 'the recipient is worked out the same way first')
})

test('the form shows the Welcome Email as a read-only note with the subject and the three attachments, and still lets staff change the recipient', () => {
  const source = read(...FILES.form)
  assert.match(source, /^'use client'/)
  assert.match(source, /defaults: \{ to: string; subject: string; body: string; portal: boolean; welcome: boolean \}/)
  assert.match(source, /import \{ WELCOME_EMAIL_NOTE, WELCOME_EMAIL_TITLE \} from '\.\.\/welcome-email-copy'/)
  assert.doesNotMatch(source, /server-only|lib\/email|quote-portal|welcome-documents/, 'a client component imports no server code')
  // To is one field for every document; the subject and message fields are only for the others.
  assert.equal(count(source, '<TextField name="to"'), 1)
  const branch = source.indexOf('{defaults.welcome ? (')
  const closed = source.indexOf(') : (', branch)
  assert.ok(branch > -1 && closed > branch, 'a welcome branch')
  const note = source.slice(branch, closed)
  assert.match(note, /role="note"/)
  assert.match(note, /\{WELCOME_EMAIL_TITLE\}/)
  assert.match(note, /Subject: \{defaults\.subject\}/)
  assert.match(note, /\{WELCOME_EMAIL_NOTE\}/)
  assert.match(note, /<input type="hidden" name="subject" value=\{defaults\.subject\} \/>/, 'the action still needs a subject to read')
  assert.match(note, /<input type="hidden" name="body" value=\{defaults\.body\} \/>/)
  assert.doesNotMatch(note, /<TextField|<TextAreaField/, 'no editable subject or message')
  const rest = source.slice(closed)
  assert.match(source, /\{defaults\.welcome \? null : <TextField name="subject" label="Subject" required defaultValue=\{defaults\.subject\} \/>\}/, 'the others keep their subject field, beside the recipient')
  assert.match(rest, /<TextAreaField name="body" label=\{defaults\.portal \? 'Personal note' : 'Message'\} rows=\{10\} defaultValue=\{defaults\.body\} \/>/)
})

test('the staff note names the three attachments and says the subject and message are fixed', async () => {
  const { WELCOME_EMAIL_NOTE, WELCOME_EMAIL_TITLE } = await import('../../features/documents/welcome-email-copy.ts')
  assert.equal(WELCOME_EMAIL_TITLE, 'HIMARK Welcome Email')
  assert.equal(
    WELCOME_EMAIL_NOTE,
    'This invoice goes out as the HIMARK Welcome Email, with three attachments: the invoice, the HIMARK Welcome Letter and HIMARK Your Next Steps. The subject and the message are fixed. Replies go to your own email address.',
  )
})

// ---- what was not touched --------------------------------------------------------------------------------------

test('no migration was added: the newest is still the billing final review fixes', () => {
  const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), '20261026110000_billing_final_review_fixes.sql', 'no file is newer')
})

test('no new database function is called, and no new module touches the service-role client', () => {
  for (const name of NEW_FILES) {
    const source = read(...FILES[name])
    assert.deepEqual(rpcNames(source), [], `${name}: no rpc`)
    assert.doesNotMatch(source, /supabase\/admin|createAdminSupabase|SUPABASE_SECRET|SERVICE_ROLE/i, `${name}: no service-role client`)
  }
  assert.deepEqual(rpcNames(action()), ['record_document_email'])
})

test('the pure new modules carry no directive, no server-only and no alias import, so node --test can load them', () => {
  for (const name of ['build', 'documents', 'copy', 'template'] as const) {
    const source = read(...FILES[name])
    assert.doesNotMatch(source, /^\s*import\s+['"]server-only['"]/m, `${name}: no server-only import`)
    assert.doesNotMatch(source, /^\s*['"]use (server|client)['"]/m, `${name}`)
    assert.doesNotMatch(source, /from\s+['"]@\//, `${name}: relative imports only`)
  }
})

test('the new modules never say paid, synced, handed off or completed, and are plain ASCII', () => {
  for (const name of [...NEW_FILES, 'defaults', 'form', 'action', 'approve'] as const) {
    // The one character that is not ASCII is the ellipsis of the form's "Sending..." button, which was there before this change.
    const source = read(...FILES[name]).replace(`'Sending${String.fromCharCode(0x2026)}'`, "'Sending'")
    assert.doesNotMatch(source, /[^\n -~]/, `${name} is plain ASCII`)
    if ((NEW_FILES as readonly string[]).includes(name)) assert.doesNotMatch(source, /\bpaid\b|synced|handed off|completed/i, `${name} avoids those words`)
  }
})
