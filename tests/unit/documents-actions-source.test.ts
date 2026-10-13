import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const dir = join(process.cwd(), 'features', 'documents')
const read = (...parts: string[]) => readFileSync(join(dir, ...parts), 'utf8')
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)
const actions = readdirSync(join(dir, 'actions')).filter((name) => name.endsWith('.ts'))

test("'use server' files export only async functions and types", () => {
  assert.ok(actions.length >= 4)
  for (const name of actions) {
    const source = read('actions', name)
    assert.match(source, /^'use server'/, `${name} must be a server-action module`)
    for (const line of source.split('\n')) {
      if (!/^export /.test(line)) continue
      assert.match(line, /^export (async function|type) /, `${name} exports something other than an async function or a type: ${line}`)
    }
  }
})

test('shared modules carry no directive and no server-only import', () => {
  for (const name of ['vocabulary.ts', 'types.ts', 'fields.ts', 'errors.ts', 'document-view.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), `${name} must not be a client module`)
    assert.doesNotMatch(source, /server-only/, `${name} is imported by tests and client code`)
    assert.doesNotMatch(source, /from\s+['"]@\//, `${name} must use relative imports so unit tests can load it`)
  }
})

test('every write scopes by organisation and no action touches audit data or fixtures', () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.doesNotMatch(source, /audit_events|fixtures?\/|mocks?\//, name)
  }
  for (const name of ['company.ts', 'lines.ts']) {
    assert.match(read('actions', name), /\.eq\('organization_id', organization\.id\)|organization_id: organization\.id/, `${name} must scope by organisation`)
  }
})

test('the document kind and ids are checked before anything is read or written', () => {
  const lines = read('actions', 'lines.ts')
  assert.match(lines, /isDocumentKind\(kind\)/)
  assert.match(lines, /isUuid\(/)
  const send = read('actions', 'send.ts')
  assert.match(send, /isUuid\(/)
  assert.match(send, /documentErrorMessage\(/, 'database tokens are turned into plain messages')
  assert.match(lines, /documentErrorMessage\(/)
})

test('the company details action refuses anyone without the permission before it writes', () => {
  const source = read('actions', 'company.ts')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const write = source.indexOf("from('organization_settings')")
  assert.ok(permission > -1 && write > -1 && permission < write, 'the permission check must come before the write')
})

test('revalidation names the route group so it matches the real pages', () => {
  const source = read('revalidate.ts')
  assert.match(source, /\/\(unison\)\/commercial\/quotes\/\[quoteId\]/)
  assert.match(source, /\/\(unison\)\/finance\/invoices\/\[invoiceId\]/)
})

test('moving a line checks its direction at runtime and tells a vanished line apart from a save failure', () => {
  const source = read('actions', 'lines.ts')
  const move = source.slice(source.indexOf('export async function moveLineAction'))
  const check = move.indexOf("direction !== 'up' && direction !== 'down'")
  assert.ok(check > -1, 'the direction is validated at runtime, not only by its type')
  assert.ok(check < move.indexOf('documentContext()'), 'the direction is checked before anything is read')
  assert.match(move, /That move is not valid\./)
  assert.match(move, /if \(moved\.error\) return \{ error: lineError\(moved\.error\) \}\s+if \(!moved\.data\) return \{ error: 'That line no longer exists\.' \}/, 'a line deleted mid-move gets its own message')
})

test('saving the company details also refreshes the document pages that print them', () => {
  const source = read('actions', 'company.ts')
  assert.match(source, /revalidatePath\('\/settings\/company'\)/)
  assert.match(source, /revalidateDocumentPages\(\)/, 'a draft document prints the live company details')
})

test('getDocument is wrapped in cache() so one page loads a document once', () => {
  const source = read('queries', 'get-document.ts')
  assert.match(source, /import \{ cache \} from 'react'/)
  assert.match(source, /export const getDocument = cache\(/)
})

test('the email action checks everything cheap first, sends once, and records only after the mail server accepts', () => {
  const source = read('actions', 'email.ts')
  assert.match(source, /^'use server'/)
  const order = [
    'isDocumentKind(kind)',
    'readEmailFields(',
    'getDocument(',
    'isDraftStatus(',
    "status === 'Cancelled'",
    '>= HOURLY_EMAIL_CAP',
    'makeDocumentPdf(',
    '> MAX_EMAIL_PDF_BYTES',
    'await sendEmail(',
    '!delivered',
    "rpc('record_document_email'",
  ].map((marker) => {
    const at = source.indexOf(marker)
    assert.ok(at > -1, `${marker} must appear in the email action`)
    return at
  })
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the steps must run in this order')
  assert.equal(source.split('await sendEmail(').length - 1, 1, 'exactly one send')
  assert.equal(source.split("rpc('record_document_email'").length - 1, 1, 'exactly one record')
  assert.match(source, /catch \(error\)[\s\S]*?did not accept the message\. It may not have been sent; check Emails sent and your mailbox before trying again\./, 'a failure of the mail server is reported honestly')
  // Everything between the send and the record: a send failure and log mode both return before the RPC.
  const afterSend = source.slice(source.indexOf('await sendEmail('), source.indexOf("rpc('record_document_email'"))
  assert.doesNotMatch(afterSend, /record_document_email/, 'a send failure records nothing')
  assert.match(afterSend, /return \{ error: 'The mail server did not accept/, 'a failed send returns before the record')
  assert.match(afterSend, /if \(!delivered\) return \{ error: 'Email is in log mode \(EMAIL_TRANSPORT=log\): the message was logged, not sent, and nothing was recorded\.' \}/, 'log mode returns before the record')
  assert.doesNotMatch(source, /process\.env|GRAPH_|MAIL_FROM|createClient\(|SUPABASE_SECRET/, 'no secrets and no service client in the action')
})

test('a failed record after a successful send says only that it was not recorded, with no database token', () => {
  const source = read('actions', 'email.ts')
  assert.match(source, /if \(recorded\.error\) \{\s+console\.error\('\[documents:email:record\]', recorded\.error\)\s+(?:\/\/[^\n]*\s+)?return \{ error: "Sent, but we couldn't record it\." \}\s+\}/)
  assert.doesNotMatch(source, /failureState|documentErrorMessage/, 'a database message could say the address is invalid for an email that already went out')
})

test('a cancelled invoice is not emailed, the PDF stays', () => {
  const source = read('actions', 'email.ts')
  assert.match(source, /if \(kind === 'invoice' && bundle\.record\.status === 'Cancelled'\) return \{ error: 'A cancelled invoice cannot be emailed\.' \}/)
})

test('the too-large message does not suggest a remedy a frozen document cannot use', () => {
  const source = read('actions', 'email.ts')
  assert.match(source, /which is too large to email\. Download it and send it yourself\. For future documents, a lighter header image under Settings, Company details keeps the PDF small enough to email\./)
  assert.doesNotMatch(source, /or use a lighter header image/)
})

test('sendEmail reports whether the message was delivered, and log mode says it was not', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'email', 'send-email.ts'), 'utf8')
  assert.match(source, /Promise<\{ delivered: boolean \}>/)
  assert.match(source, /return \{ delivered: false \}/)
  assert.match(source, /return \{ delivered: true \}/)
  assert.ok(source.indexOf('return { delivered: false }') < source.indexOf('await sendMimeViaGraph('), 'log mode returns before anything is sent')
  assert.ok(source.indexOf('await sendMimeViaGraph(') < source.indexOf('return { delivered: true }'), 'delivered is true only after the mail server accepts')
})

test('the shared email module is loadable by tests', () => {
  for (const name of ['email.ts', 'action-failure.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), name)
    assert.doesNotMatch(source, /server-only/, name)
    assert.doesNotMatch(source, /from\s+['"]@\//, name)
  }
})

test('create-invoice-from-quote checks the id, lets the database decide, and opens the new draft', () => {
  const source = read('actions', 'invoice-from-quote.ts')
  assert.match(source, /^'use server'/)
  assert.match(source, /isUuid\(/)
  assert.match(source, /rpc\('create_invoice_from_quote'/)
  assert.match(source, /failureState\(/)
  assert.match(source, /redirect\(`\$\{DOCUMENTS\.invoice\.base\}\//)
  assert.doesNotMatch(source, /from\('invoices'\)\s*\.insert|from\('invoice_lines'\)\s*\.insert/, 'the copy is made by the database function, not by the action')
})
