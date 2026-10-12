import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

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
  assert.doesNotMatch(form, /INVOICE_ISSUED_STATUSES/, 'an issued invoice has no status to pick: it comes from the payments')
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

test('a sent quote saves only its status and notes; an issued invoice only its notes', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = between(action, QUOTE_OPENER, INVOICE_OPENER, 'quote branch')
  const invoice = between(action, INVOICE_OPENER, EXPENSE_OPENER, 'invoice branch')
  assert.ok(quote.includes('values = { status, notes: optional(form, "notes") };'), 'the sent-quote branch builds exactly status and notes')

  // The issued branch runs from its comment to the "} else {" of the draft branch.
  const issued = between(invoice, '// Issued:', '} else {', 'issued invoice branch')
  // The literal may be one line or several: it ends at the first "};".
  const literal = issued.match(/values = \{([\s\S]*?)\};/)
  assert.ok(literal, 'the issued-invoice branch assigns an object literal to values')
  const keys = [...literal[1].matchAll(/(?:^|[{,])\s*([a-z_]+)\s*:/g)].map((match) => match[1]).sort()
  assert.deepEqual(keys, ['notes'])
})

test('the invoices register counts only collectible invoices as outstanding', () => {
  // The rule moved into the database function that computes the cards (Stage 3 part 1); the guard reads it there.
  const migration = read('supabase', 'migrations', '20261011160000_register_summary.sql')
  const invoice = between(migration, "elsif p_kind = 'invoice' then", "elsif p_kind = 'expense' then", 'invoice summary')
  const outstanding = between(invoice, "'outstanding'", "'overdue'", 'outstanding branch')
  assert.match(outstanding, /status in \('Issued', 'Partially Paid', 'Overdue'\)/, 'a draft, paid or cancelled invoice is not outstanding')
  assert.match(outstanding, /balance_amount > 0/, 'the balance is still checked')
  assert.match(outstanding, /archived_at is null/, 'an archived invoice is not outstanding')
  const overdue = invoice.slice(invoice.indexOf("'overdue'"))
  assert.match(overdue, /status = 'Overdue'/)
  assert.match(overdue, /archived_at is null/)
})

test('the register and detail queries show a draft as a draft, not as a reference code', () => {
  // The row mapping moved to the pure mapper module (Stage 3 part 1); the guard reads it there.
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  const mappers = read('features', 'commercial-finance', 'phase-six-mappers.ts')
  assert.match(mappers, /isDraftReference\(/)
  assert.match(mappers, /Draft quote/)
  assert.match(mappers, /Draft invoice/)
  const quotes = between(mappers, "case 'quote':", "case 'opportunity':", 'mapper quote case')
  const invoices = between(mappers, "case 'invoice':", "case 'expense':", 'mapper invoice case')
  assert.match(quotes, /name: documentName\(row\.quote_number, row\.client_name, 'quote'\)/)
  assert.match(invoices, /name: documentName\(row\.invoice_number, row\.client_name, 'invoice'\)/)
  for (const [name, block] of [['quote', quotes], ['invoice', invoices]] as const) {
    for (const key of ['projectName', 'projectDescription', 'projectRef', 'clientRef', 'vatRate']) {
      assert.match(block, new RegExp(`\\b${key}: row\\.`), `${name} maps ${key}`)
    }
  }
  assert.match(quotes, /issueDate: row\.issue_date/)
  // The invoice form's "Source quote" list must not show a draft as DRAFT-xxxx.
  const options = between(queries, 'export async function getPhaseSixOptions', 'async function records', 'getPhaseSixOptions')
  assert.match(options, /select\("id,quote_number,client_name,contact_name,project_name,project_ref,client_ref"\)/)
  assert.match(options, /label: documentName\(row\.quote_number, row\.client_name, "quote"\)/)
})

test('the register offers import only for a collection that has import columns', () => {
  // The screen decides the Import link from the collection's import columns (Stage 3 part 1).
  const screen = read('features', 'registers', 'components', 'register-screen.tsx')
  assert.doesNotMatch(screen, /importHref=\{`/, 'a fixed Import link would show a dead Import button on quotes and invoices')
  assert.match(screen, /portableDefinitions\[spec\.collection as PortableCollection\]\.importColumns/)
  assert.match(screen, /const importHref = importColumns\s*\?/, 'the link exists only when the collection has import columns')
  assert.match(screen, /importHref=\{importHref\}/)
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
  assert.match(source, /To revise it, duplicate it as a new draft\./, 'a locked quote says how to revise it')
  assert.match(source, /To correct it, cancel it and raise a new one\./, 'a locked invoice says how to correct it')
  assert.match(source, /locked \? LOCKED_NOTE\[kind\]/, 'the note depends on the kind of document')
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
    [page('finance', 'invoices', '[invoiceId]'), 'invoice', 'invoiceId', 'InvoiceWorkspace'],
  ] as const) {
    assert.match(source, /<DocumentActions\s/, `${kind} page mounts the document actions`)
    assert.match(source, /<LineEditor\s/, `${kind} page mounts the line editor`)
    assert.match(source, new RegExp(`getDocument\\('${kind}', ${id}\\)`))
    const mounted = new RegExp(`<PhaseSixDetail\\s+kind="${kind}"\\s+id=\\{${id}\\}\\s+actions=\\{[\\s\\S]*?\\}\\s+after=\\{<${component} ${id}=\\{${id}\\}( notice=\\{notice\\})? />\\}\\s*/>`)
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

test('the print button opens a bare print page; the document and print pages check the id before they load anything', () => {
  assert.doesNotMatch(component('print-button'), /window\.print\(\)/, 'the button no longer prints the page with its shell around it')
  assert.match(component('print-button'), /target="_blank"/)
  assert.ok(isClientModule(component('auto-print')))
  assert.match(component('auto-print'), /window\.print\(\)/, 'the bare page opens the print dialog itself, after its pictures loaded')
  assert.match(component('auto-print'), /document\.images/)
  for (const [route, id, kind] of [
    [['commercial', 'quotes', '[quoteId]'], 'quoteId', 'quote'],
    [['finance', 'invoices', '[invoiceId]'], 'invoiceId', 'invoice'],
  ] as const) {
    const source = read('app', '(unison)', ...route, 'document', 'page.tsx')
    const check = source.indexOf(`isUuid(${id})`)
    const load = source.indexOf(`getDocument('${kind}', ${id})`)
    assert.ok(check > -1 && load > -1 && check < load, `${kind} document page rejects a malformed id before loading`)
    assert.match(source, /<DocumentSheet view=\{view\} \/>/)
    assert.ok(source.includes(`<PrintButton href={\`/print/${kind}/\${${id}}\`} />`), `the ${kind} page links its print button to the bare print page`)
    assert.match(source, /buildDocumentView\(/)
    const bare = read('app', '(print)', 'print', kind, `[${id}]`, 'page.tsx')
    const bareCheck = bare.indexOf(`isUuid(${id})`)
    const bareLoad = bare.indexOf(`getDocument('${kind}', ${id})`)
    assert.ok(bareCheck > -1 && bareLoad > -1 && bareCheck < bareLoad, `the bare ${kind} print page rejects a malformed id before loading`)
    assert.match(bare, /<DocumentSheet view=\{view\} \/>/)
    assert.match(bare, /<AutoPrint \/>/)
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
    '.document-print { position: relative !important; width: 100% !important',
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

test('a sent or issued document offers the PDF and email; a draft offers neither; only an accepted quote offers Create invoice', () => {
  const source = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(source, /Download PDF/)
  assert.match(source, /document\/pdf/, 'the download link points at the PDF route')
  assert.match(source, /#email-client/, 'Email to client jumps to the email section')
  assert.match(source, /createInvoiceFromQuoteAction/)
  assert.match(source, /status === 'Accepted'/, 'Create invoice only for an accepted quote')
  const pdf = source.indexOf('Download PDF')
  assert.ok(source.lastIndexOf('!draft', pdf) > -1, 'the PDF link sits behind the not-a-draft check')
})

test('a cancelled invoice keeps its PDF but offers no email link; an archived quote offers no Create invoice', () => {
  const source = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(source, /archived\?: boolean/)
  assert.match(source, /const cancelled = kind === 'invoice' && status === 'Cancelled'/)
  assert.match(source, /\{!cancelled \? \(\s*<a href="#email-client"/, 'the email link is hidden for a cancelled invoice')
  assert.ok(source.indexOf('Download PDF') < source.indexOf('{!cancelled'), 'the PDF link is not behind the cancelled check')
  assert.match(source, /status === 'Accepted' && !archived/, 'Create invoice needs a quote that is not archived')
  const quotePage = read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')
  assert.match(quotePage, /archived=\{Boolean\(bundle\.record\.archived_at\)\}/)
})

test('the email section shows a note instead of the form for a cancelled invoice, and keeps the history', () => {
  const source = read('features', 'documents', 'components', 'email-section.tsx')
  assert.match(source, /const cancelled = kind === 'invoice' && bundle\.record\.status === 'Cancelled'/)
  assert.match(source, /A cancelled invoice cannot be emailed\. You can still download its PDF\./)
  assert.match(source, /\) : cancelled \? \(/, 'a cancelled invoice gets the note branch, not the form')
  assert.match(source, /cancelled \? Promise\.resolve\(null\) : getEmailDefaults\(/, 'no email defaults are built for a cancelled invoice')
  assert.match(source, /sent\.length \? history : null/, 'the history stays visible only when it has rows')
  assert.match(source, /Emails sent/)
  assert.ok(source.indexOf('A cancelled invoice cannot be emailed.') < source.indexOf('<EmailDocumentForm'), 'the note sits before the form branch')
})

test('the email form keeps what was typed, cannot be double-submitted, and sends nothing but the three fields', () => {
  const source = read('features', 'documents', 'components', 'email-document-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /disabled=\{pending\}/, 'the Send button is disabled while a send is pending')
  assert.match(source, /name="to"/)
  assert.match(source, /name="subject"/)
  assert.match(source, /name="body"/)
  assert.match(source, /event\.preventDefault\(\)/, 'the action is called by hand so a failed send does not reset the form')
  assert.match(source, /startTransition\(/)
  assert.doesNotMatch(source, /server-only|pdf\/|lib\/email/, 'a client component imports no server code')
})

test('the email section explains that a draft must be sent first, and shows the history', () => {
  const source = read('features', 'documents', 'components', 'email-section.tsx')
  assert.match(source, /Send or issue this document before emailing it/)
  assert.match(source, /id="email-client"/)
  assert.match(source, /listDocumentEmails\(/)
  assert.match(source, /getEmailDefaults\(/)
  assert.match(source, /Emails sent/)
})

test('the quote and invoice pages show the email section, and the quote page lists the invoices made from it', () => {
  const quote = read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')
  assert.match(quote, /EmailSection kind="quote"/)
  assert.match(quote, /QuoteInvoices quoteId=/)
  const invoice = read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')
  assert.match(invoice, /EmailSection kind="invoice"/)
})

test('the sheet and the PDF cover the whole page: the bottom section stretches to the bottom edge and the footer is a full-width band', () => {
  const sheet = component('document-sheet')
  assert.match(sheet, /className=\{`document-print relative mx-auto flex min-h-\[296mm\] w-full max-w-\[210mm\] flex-col /, 'the sheet is a column at least a page high')
  assert.match(sheet, /<section className="mt-\[4mm\] grid flex-1 grid-cols-\[38%_34%_28%\]">/, 'the bank / closing / picture row takes the remaining height')
  assert.match(sheet, /<header className="relative h-\[30mm\] bg-\[#bcd9f5\]">/, 'the header is short enough that a typical quote, with its closing text, fits one A4 page with its footer')
  assert.match(sheet, /<footer className="[^"]*bg-\[#bcd9f5\] px-\[12mm\][^"]*">/, 'the footer is a full-width band, not an inset rule')
  assert.doesNotMatch(sheet, /<footer className="[^"]*mx-\[12mm\]/, 'the footer has no side margin')
  assert.match(sheet, /@page \{ size: A4; margin: 0; \}/, 'the printed page has no margin')
  assert.match(sheet, /\.document-print \{ position: relative !important; width: 100% !important; max-width: none !important; min-height: calc\(100vh - 1mm\);/, 'when printed the sheet is as wide and as tall as the paper, whatever size the paper is')
  const pdf = readFileSync(join(process.cwd(), 'features', 'documents', 'pdf', 'render-document-pdf.ts'), 'utf8')
  assert.match(pdf, /minHeight: mm\(28\), flexGrow: 1 \}/, 'the PDF bottom row grows to the bottom of the page')
  assert.match(pdf, /paddingHorizontal: mm\(12\), paddingVertical: mm\(4\), backgroundColor: BAND \}/, 'the PDF footer is a full-width band')
  assert.match(pdf, /paddingTop: mm\(10\), paddingBottom: 0 \}/, 'the PDF page has no bottom padding')
})
