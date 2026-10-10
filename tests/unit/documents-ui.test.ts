import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

/** The text between two exact markers; fails loudly if either is missing or they are out of order. */
function between(source: string, start: string, end: string, label: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + 1)
  assert.ok(from > -1, `${label}: opener not found: ${start}`)
  assert.ok(to > from, `${label}: closer not found after the opener: ${end}`)
  return source.slice(from, to)
}

const QUOTE_OPENER = '} else if (kind === "quote") {'
const INVOICE_OPENER = '} else if (kind === "invoice") {'
const EXPENSE_OPENER = '} else if (kind === "expense") {'

test('the quote and invoice forms no longer ask for a number or any total', () => {
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  for (const name of ['quoteNumber', 'invoiceNumber', 'subtotal', 'taxAmount', 'totalAmount']) {
    assert.doesNotMatch(form, new RegExp(`name="${name}"`), `${name} is generated or calculated`)
  }
  assert.doesNotMatch(form, /name="issueDate"/, 'an invoice is dated the day it is issued; the draft form has no issue date to type')
  assert.match(form, /isDraftStatus\(/, 'the form behaves differently for a sent or issued document')
  assert.match(form, /QUOTE_SENT_STATUSES/)
  assert.match(form, /INVOICE_ISSUED_STATUSES/)
})

test('the save action never writes a number, a total or a milestone for a quote or an invoice', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = between(action, QUOTE_OPENER, INVOICE_OPENER, 'quote branch')
  const invoice = between(action, INVOICE_OPENER, EXPENSE_OPENER, 'invoice branch')
  for (const [name, block] of [['quote', quote], ['invoice', invoice]] as const) {
    assert.doesNotMatch(block, /quote_number|invoice_number|subtotal|tax_amount|total_amount\s*[:,]|sent_at|accepted_at/, `${name} branch`)
    assert.match(block, /readDocumentExtras\(form\)/, `${name} branch reads the project and client reference`)
    assert.match(block, /isDraftStatus\(/, `${name} branch treats a sent or issued document differently`)
  }
  assert.match(action, /documentErrorMessage\(message\)/, 'database tokens become plain messages')
  assert.match(quote, /documentErrorMessage\("QUOTE_FROZEN"\)/, 'a stale form posted to a sent quote is told it is frozen')
  assert.match(invoice, /documentErrorMessage\("INVOICE_FROZEN"\)/, 'a stale form posted to an issued invoice is told it is frozen')
})

test('a sent quote saves only its status and notes; an issued invoice only its status, balance, paid date and notes', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = between(action, QUOTE_OPENER, INVOICE_OPENER, 'quote branch')
  const invoice = between(action, INVOICE_OPENER, EXPENSE_OPENER, 'invoice branch')
  assert.ok(quote.includes('values = { status, notes: optional(form, "notes") };'), 'the sent-quote branch builds exactly status and notes')

  // The issued branch runs from its comment to the "} else {" of the draft branch.
  const issued = between(invoice, '// Issued:', '} else {', 'issued invoice branch')
  const literal = issued.match(/values = \{([\s\S]*?)\n\s*\};/)
  assert.ok(literal, 'the issued-invoice branch assigns an object literal to values')
  const keys = [...literal[1].matchAll(/^\s*([a-z_]+)\s*[:,]/gm)].map((match) => match[1]).sort()
  assert.deepEqual(keys, ['balance_amount', 'notes', 'paid_at', 'status'])
})

test('the register and detail queries show a draft as a draft, not as a reference code', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.match(queries, /isDraftReference\(/)
  assert.match(queries, /Draft quote/)
  assert.match(queries, /Draft invoice/)
  const quotes = between(queries, 'export async function listQuotes', 'export async function listInvoices', 'listQuotes')
  const invoices = between(queries, 'export async function listInvoices', 'export async function listExpenses', 'listInvoices')
  assert.match(quotes, /name: documentName\(row\.quote_number, row\.client_name, "quote"\)/)
  assert.match(invoices, /name: documentName\(row\.invoice_number, row\.client_name, "invoice"\)/)
  for (const [name, block] of [['listQuotes', quotes], ['listInvoices', invoices]] as const) {
    for (const key of ['projectName', 'projectDescription', 'projectRef', 'clientRef', 'vatRate']) {
      assert.match(block, new RegExp(`\\b${key}: row\\.`), `${name} maps ${key}`)
    }
  }
  assert.match(quotes, /issueDate: row\.issue_date/)
  // The invoice form's "Source quote" list must not show a draft as DRAFT-xxxx.
  const options = between(queries, 'export async function getPhaseSixOptions', 'async function records', 'getPhaseSixOptions')
  assert.match(options, /select\("id,quote_number,client_name"\)/)
  assert.match(options, /label: documentName\(row\.quote_number, row\.client_name, "quote"\)/)
})

test('the register offers import only for a collection that has import columns', () => {
  const register = read('features', 'commercial-finance', 'components', 'phase-six-register.tsx')
  assert.doesNotMatch(register, /allowImport:\s*true/, 'a fixed allowImport: true would show a dead Import button on quotes and invoices')
  assert.match(register, /allowImport:\s*Boolean\(portableDefinitions\[portableCollectionByKind\[kind\]\]\.importColumns\)/)
})

test('quotes and invoices can no longer be imported, but can still be exported', () => {
  const source = read('features', 'data-portability', 'portable-collections.ts')
  const quotes = source.slice(source.indexOf('quotes: {'), source.indexOf('invoices: {'))
  const invoices = source.slice(source.indexOf('invoices: {'), source.indexOf('expenses: {'))
  for (const [name, block] of [['quotes', quotes], ['invoices', invoices]] as const) {
    assert.doesNotMatch(block, /importColumns/, `${name} must not be importable`)
    assert.match(block, /columns:\s*\[/, `${name} stays exportable`)
  }
})

test('a client can carry a billing address and a VAT number', () => {
  const schema = read('features', 'clients', 'schemas', 'client.ts')
  for (const field of ['addressLine1', 'addressLine2', 'city', 'postalCode', 'country', 'vatNumber']) assert.match(schema, new RegExp(field))
  for (const file of ['create-client.ts', 'update-client.ts']) {
    const source = read('features', 'clients', 'actions', file)
    for (const column of ['address_line1', 'address_line2', 'city', 'postal_code', 'country', 'vat_number']) assert.match(source, new RegExp(column), `${file} saves ${column}`)
  }
  const form = read('features', 'clients', 'components', 'client-form.tsx')
  for (const name of ['addressLine1', 'addressLine2', 'city', 'postalCode', 'country', 'vatNumber']) assert.match(form, new RegExp(`name="${name}"`))
})

const component = (name: string) => read('features', 'documents', 'components', `${name}.tsx`)
const isClientModule = (source: string) => /^\s*['"]use client['"]/.test(source)

test('the long forms call their action by hand so a failed save keeps what was typed', () => {
  for (const name of ['company-details-form', 'price-item-form']) {
    const source = component(name)
    assert.ok(isClientModule(source), `${name} uses hooks`)
    assert.doesNotMatch(source, /<form\s+action=/, `${name}: React resets a <form action> after it runs`)
    assert.match(source, /startTransition\(/, `${name} submits through startTransition`)
    assert.match(source, /event\.preventDefault\(\)/)
  }
})

test('only an owner or admin sees editable company details, and the page is a server route', () => {
  const form = component('company-details-form')
  assert.match(form, /<fieldset\s+disabled=\{!canEdit\}/)
  const page = read('app', '(unison)', 'settings', 'company', 'page.tsx')
  assert.match(page, /getCompanySettings\(\)/)
  assert.doesNotMatch(page, /^\s*['"]use client['"]/)
})

test('the price list page reads only valid ids, and archives instead of deleting', () => {
  const page = read('app', '(unison)', 'settings', 'price-list', 'page.tsx')
  assert.match(page, /isUuid\(/)
  const screen = component('price-list-screen')
  assert.match(screen, /archivePriceItemAction/)
  assert.doesNotMatch(screen, /delete/i)
})

test('the organisation profile links to the company details and the price list', () => {
  const screen = read('features', 'organizations', 'components', 'organization-profile-screen.tsx')
  assert.match(screen, /href="\/settings\/company"/)
  assert.match(screen, /href="\/settings\/price-list"/)
  assert.match(screen, /Additional defaults, permissions and policies are not available in this release\./, 'the existing sentence stays')
})

test('the line editor is a client module whose forms keep typed values and whose controls are labelled', () => {
  const source = component('line-editor')
  assert.ok(isClientModule(source))
  assert.doesNotMatch(source, /<form\s+action=/, 'React resets a <form action> after it runs')
  assert.match(source, /startTransition\(/)
  for (const action of ['addLineAction', 'updateLineAction', 'removeLineAction', 'moveLineAction']) assert.match(source, new RegExp(action))
  assert.match(source, /ariaLabel=\{`Remove: \$\{line\.title\}`\}/)
  assert.match(source, /aria-label=\{`Edit line: \$\{line\.title\}`\}/)
  assert.match(source, /locked/, 'a sent document shows no editing controls')
  assert.match(source, /locked \? null : <AddLineForm/, 'the add form is rendered only while the document is not locked')
  assert.match(source, /editing && !locked/, 'a locked line never opens its edit form')
  assert.match(source, /\{locked \? null : \(/, 'a locked line shows no controls')
  assert.match(source, /sent or issued, so its lines are frozen/, 'the locked note covers invoices as well as quotes')
})

test('the line editor offers the price list and fills the line from it, but a free-text line stays possible', () => {
  const source = component('line-editor')
  assert.match(source, /Fill from the price list/)
  assert.match(source, /priceListItemId/)
  assert.match(source, /One-off line/)
})

test('the Send, Issue and Duplicate buttons are server-rendered and confirm before they act', () => {
  const source = component('document-actions')
  assert.ok(!isClientModule(source))
  assert.doesNotMatch(source, /useState\(|useEffect\(|useActionState\(/)
  assert.match(source, /sendQuoteAction\.bind\(null, id\)/)
  assert.match(source, /issueInvoiceAction\.bind\(null, id\)/)
  assert.match(source, /duplicateQuoteAction\.bind\(null, id\)/)
  assert.match(source, /confirmText=/)
  assert.match(source, /isDraftStatus\(kind, status\)/)
})

test('the quote and invoice pages mount the document actions and the line editor behind the existing record check', () => {
  const page = (...parts: string[]) => read('app', '(unison)', ...parts, 'page.tsx')
  for (const [source, kind, id, component] of [
    [page('commercial', 'quotes', '[quoteId]'), 'quote', 'quoteId', 'QuoteWorkspace'],
    [page('finance', 'invoices', '[invoiceId]'), 'invoice', 'invoiceId', 'InvoiceLines'],
  ] as const) {
    assert.match(source, /<DocumentActions\s/, `${kind} page mounts the document actions`)
    assert.match(source, /<LineEditor\s/, `${kind} page mounts the line editor`)
    assert.match(source, new RegExp(`getDocument\\('${kind}', ${id}\\)`))
    const mounted = new RegExp(`<PhaseSixDetail\\s+kind="${kind}"\\s+id=\\{${id}\\}\\s+actions=\\{[\\s\\S]*?\\}\\s+after=\\{<${component} ${id}=\\{${id}\\} />\\}\\s*/>`)
    assert.match(source, mounted, `${kind} page keeps its detail wiring`)
  }
})

test('the document sheet prints what the view says as text, with print styling, and loads only view-supplied images', () => {
  const source = component('document-sheet')
  assert.ok(!isClientModule(source), 'the sheet is a server component')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'user text is never rendered as HTML')
  assert.doesNotMatch(source, /useState\(|useEffect\(/)
  assert.match(source, /@page\s*\{\s*size:\s*A4/)
  assert.match(source, /-webkit-print-color-adjust:\s*exact/, 'the prefixed declaration')
  assert.match(source, /(?<![-\w])print-color-adjust:\s*exact/, 'the unprefixed declaration')
  const images = [...source.matchAll(/<img\s[^>]*src=\{([^}]+)\}/g)].map((match) => match[1].trim())
  assert.equal(images.length, 3, 'the header, the logo and the closing photo are the only images')
  assert.equal([...source.matchAll(/<img\b/g)].length, images.length, 'every <img> has a src taken from the view')
  for (const src of images) assert.match(src, /^view\.(headerImage|logo)$/, `an image src must come from the checked view: ${src}`)
  assert.doesNotMatch(source, /himark|HIMARK|\/brand\//i, 'no company-specific value in the sheet')
})

test('the print button is a client module and the document pages check the id before they load anything', () => {
  assert.ok(isClientModule(component('print-button')))
  assert.match(component('print-button'), /window\.print\(\)/)
  for (const [route, id, kind] of [
    [['commercial', 'quotes', '[quoteId]'], 'quoteId', 'quote'],
    [['finance', 'invoices', '[invoiceId]'], 'invoiceId', 'invoice'],
  ] as const) {
    const source = read('app', '(unison)', ...route, 'document', 'page.tsx')
    const check = source.indexOf(`isUuid(${id})`)
    const load = source.indexOf(`getDocument('${kind}', ${id})`)
    assert.ok(check > -1 && load > -1 && check < load, `${kind} document page rejects a malformed id before loading`)
    assert.match(source, /<DocumentSheet view=\{view\} \/>/)
    assert.match(source, /<PrintButton \/>/)
    assert.match(source, /buildDocumentView\(/)
  }
})

test('printing neutralises every shell ancestor of the sheet, so it flows from the top of the page and is not clipped', () => {
  const source = component('document-sheet')
  const print = between(source, '@media print', '`\n', 'print block')
  // The rule that applies to the sheet's ancestors, on its own, so the sheet's own rule cannot satisfy these checks.
  const shell = between(print, '*:has(.document-print), .unison-route-view {', '}', 'shell rule')
  for (const needle of [
    'transform: none !important',
    'animation: none !important',
    'overflow: visible !important',
    'height: auto !important',
    'max-height: none !important',
    'position: static !important',
    'display: block !important',
  ]) assert.ok(shell.includes(needle), `the rule for the sheet's ancestors must contain: ${needle}`)
  for (const needle of [
    '*:has(.document-print) > *:not(:has(.document-print)):not(.document-print) { display: none !important; }',
    '.document-print { position: relative !important; width: 210mm !important',
  ]) assert.ok(print.includes(needle), `the print block must contain: ${needle}`)
  assert.doesNotMatch(print, /visibility:\s*hidden/, 'the old hide-everything approach would still clip and anchor to the shell')
})

test('the company details form shows its success banner beside the save button and clears it on the next edit', () => {
  const source = component('company-details-form')
  assert.match(source, /onChange=\{\(\) => setDirty\(true\)\}/, 'any edit marks the form dirty')
  assert.match(source, /setDirty\(false\)/, 'a new submit clears the dirty flag')
  assert.match(source, /state\?\.success && !dirty/, 'the banner is hidden once the user edits again')
  assert.ok(source.indexOf('<FormError') < source.indexOf('state?.success && !dirty'), 'the banner sits under the error')
  assert.ok(source.indexOf('state?.success && !dirty') < source.indexOf('<FormFooter'), 'the banner sits above the footer')
  assert.match(source, /placeholder="\/brand\/logo\.png"/)
  assert.match(source, /placeholder="\/brand\/header\.png"/)
  assert.doesNotMatch(source, /placeholder="[^"]*(himark|banner)/i, 'the placeholders carry no company-specific file')
})
