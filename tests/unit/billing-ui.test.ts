import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { documentErrorMessage } from '../../features/documents/errors.ts'

// Source tests: the UI cannot be rendered here, so each one reads the real source and asserts the gate by its structure
// (what is inside which condition), not merely that a word appears. Line endings are normalised so a regex means the same everywhere.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const detail = () => read('features', 'clients', 'components', 'client-detail.tsx')
const section = () => read('features', 'billing', 'components', 'billing-package-section.tsx')
const forms = () => read('features', 'billing', 'components', 'billing-forms.tsx')
const screen = () => read('features', 'documents', 'components', 'price-list-screen.tsx')
const editor = () => read('features', 'documents', 'components', 'line-editor.tsx')
const query = () => read('features', 'documents', 'queries', 'list-price-items.ts')

/** The number of arguments each billing action takes before useActionState's (previous, form), from its real signature. */
function boundArgumentCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const match of read('features', 'billing', 'actions', 'billing.ts').matchAll(/export async function (\w+Action)\(([^)]*)\)/g)) {
    const params = match[2].split(',').map((part) => part.trim())
    counts[match[1]] = params.indexOf(params.find((part) => part.startsWith('_previous'))!)
  }
  return counts
}

test('the dead client setup file with the old prices is gone', () => {
  assert.equal(existsSync(join(process.cwd(), 'features', 'clients', 'components', 'client-setup-workflow.tsx')), false)
  assert.doesNotMatch(read('config', 'partner-levels.ts'), /185,?000|75,?000/, 'the old prices are not used anywhere')
})

test('the client page mounts the Billing package section only for a client that is not archived, after the workspace and before the documents', () => {
  const source = detail()
  assert.match(source, /import \{ BillingPackageSection \} from '@\/features\/billing\/components\/billing-package-section'/)
  assert.match(source, /\{!archived \? <BillingPackageSection clientId=\{client\.id\} \/> : null\}/)
  const order = [source.indexOf('<RecordWorkspaceSections'), source.indexOf('<BillingPackageSection'), source.indexOf('<ClientDocuments />')]
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], 'workspace sections, then the billing package, then the documents')
})

test('every billing control binds exactly the arguments its action takes', () => {
  const counts = boundArgumentCounts()
  assert.deepEqual(Object.keys(counts).sort(), [
    'addSupportAction', 'changeTierAction', 'createFirstDocumentAction', 'createMonthlyInvoiceAction', 'createTopUpAction',
    'discardBillingDraftAction', 'endEngagementAction', 'endSupportAction', 'setPackageAction',
  ], 'the action file exports exactly the built actions')
  const expectedBinds: Record<string, string> = {
    createFirstDocumentAction: "createFirstDocumentAction.bind(null, pkg.id, 'invoice')",
    endEngagementAction: 'endEngagementAction.bind(null, pkg.id)',
    endSupportAction: 'endSupportAction.bind(null, s.id)',
    createMonthlyInvoiceAction: 'createMonthlyInvoiceAction.bind(null, clientId)',
    setPackageAction: 'setPackageAction.bind(null, clientId)',
    changeTierAction: 'changeTierAction.bind(null, engagementId)',
    addSupportAction: 'addSupportAction.bind(null, engagementId)',
    createTopUpAction: 'createTopUpAction.bind(null, engagementId)',
    discardBillingDraftAction: 'discardBillingDraftAction.bind(null, d.id)',
  }
  const source = section() + forms()
  for (const [action, bind] of Object.entries(expectedBinds)) {
    assert.ok(source.includes(bind), `${bind} is wired`)
    // Every use of the action binds as many arguments as its signature has before (previous, form).
    for (const use of source.matchAll(new RegExp(`${action}\\.bind\\(null((?:, [^,)]+)*)\\)`, 'g'))) {
      assert.equal(use[1].split(', ').filter(Boolean).length, counts[action], `${action} binds ${counts[action]} argument(s)`)
    }
  }
  assert.match(section(), /createFirstDocumentAction\.bind\(null, pkg\.id, 'quote'\)/, 'the first quote button binds the quote kind')
})

test('the first invoice and quote buttons sit inside the canBuildFirst condition and nowhere else', () => {
  const source = section()
  assert.match(
    source,
    /\{pkg\.canBuildFirst \? \(\s*<>\s*<ActionButton action=\{createFirstDocumentAction\.bind\(null, pkg\.id, 'invoice'\)\}[^\n]*\n\s*<ActionButton action=\{createFirstDocumentAction\.bind\(null, pkg\.id, 'quote'\)\}[^\n]*\n\s*<\/>\s*\) : null\}/,
  )
  assert.equal(source.match(/createFirstDocumentAction\.bind/g)?.length, 2, 'only the two gated buttons build a first document')
})

test('the monthly invoice form is inside the canBuildMonthly condition, with an optional month and nothing issued', () => {
  assert.match(
    section(),
    /\{view\.canBuildMonthly \? \(\s*<div[^\n]*>\s*<p[^\n]*<\/p>\s*<MonthlyInvoiceForm clientId=\{clientId\} \/>\s*<\/div>\s*\) : null\}/,
  )
  assert.equal(section().match(/<MonthlyInvoiceForm/g)?.length, 1, 'one monthly form, the gated one')
  const source = forms()
  const form = source.slice(source.indexOf('export function MonthlyInvoiceForm'))
  assert.match(form, /useActionState\(createMonthlyInvoiceAction\.bind\(null, clientId\), undefined\)/)
  assert.match(form, /<input name="month" type="month" aria-label="Month \(leave empty for this month\)"/, 'the month is optional (no required)')
  assert.doesNotMatch(form.slice(0, form.indexOf('</form>')), /required/, 'an empty month means this month')
  assert.match(form, /Month \(leave empty for this month\)/)
  assert.match(form, /"Create this month's invoice"/)
  assert.doesNotMatch(form.slice(0, form.indexOf('</form>')), /\b(issue|send)\b/i, 'the form builds a draft only')
})

test('the package card gates each control on the flag the view model computes from the South African today', () => {
  const source = section()
  assert.match(source, /\{pkg\.state === 'scheduled' \? `Starts on \$\{pkg\.startDate\}` : `Started \$\{pkg\.startDate\}`\}/)
  assert.match(source, /\{pkg\.canEnd \? \(\s*<ActionButton action=\{endEngagementAction\.bind\(null, pkg\.id\)\}[^\n]*\/>\s*\) : null\}/)
  assert.equal(source.match(/endEngagementAction\.bind/g)?.length, 1, 'End package exists only behind canEnd')
  assert.match(source, /\{pkg\.canTopUp \? <TopUpForm engagementId=\{pkg\.id\} rateLabel=\{topUpLabel\(pkg\)\} \/> : null\}/)
  assert.equal(source.match(/<TopUpForm/g)?.length, 1, 'Top-up exists only behind canTopUp')
  assert.match(source, /\{pkg\.canChangeTier \? <ChangeTierForm engagementId=\{pkg\.id\} tiers=\{pkg\.otherTiers/)
  assert.equal(source.match(/<ChangeTierForm/g)?.length, 1, 'Change tier exists only behind canChangeTier')
  assert.match(source, /\{pkg\.canManageSupport \? <ActionButton action=\{endSupportAction\.bind\(null, s\.id\)\}/)
  assert.match(source, /\{pkg\.canManageSupport \? <AddSupportForm engagementId=\{pkg\.id\}/)
  assert.equal(source.match(/endSupportAction\.bind/g)?.length, 1)
  assert.equal(source.match(/<AddSupportForm/g)?.length, 1)
})

test('the top-up form shows the rate from the rate card row and says when it is only proposed', () => {
  const source = section()
  assert.match(source, /return `\$\{money\(pkg\.topUpRate\)\} per credit excluding VAT\$\{pkg\.topUpProposed \? ' \(proposed rate, not yet agreed\)' : ''\}\. \$\{DRAFT_NOTE\}`/)
  assert.match(source, /const money = \(amount: number\) => formatCurrency\(amount, 'ZAR'\)/, 'the repo money helper')
  assert.match(source, /if \(pkg\.topUpRate === null\) return/, 'a missing rate row falls back to plain words, never a made-up number')
})

test('each draft built from the package can be discarded, with a confirm, and links use the invoice base path', () => {
  const source = section()
  assert.match(source, /<Link href=\{`\$\{DOCUMENTS\.invoice\.base\}\/\$\{d\.id\}`\}/)
  assert.doesNotMatch(source, /\/finance\/invoices\//, 'no hard-coded invoice path')
  assert.match(
    source,
    /\{d\.isDraft \? <ActionButton action=\{discardBillingDraftAction\.bind\(null, d\.id\)\} label="Discard draft" ariaLabel=\{`Discard draft: \$\{d\.label\}`\} confirmText="Discard this draft\? You can build it again from the package\." tone="danger" \/> : null\}/,
  )
  assert.equal(source.match(/discardBillingDraftAction\.bind/g)?.length, 1, 'only drafts get the button')
})

test('Change tier is only for retainers, and the support services only for projects', () => {
  const source = section()
  const start = source.indexOf("{pkg.kind === 'project' ? (")
  const middle = source.indexOf(') : (', start)
  const end = source.indexOf('<TopUpForm', middle)
  assert.ok(start >= 0 && middle > start && end > middle, 'the package card branches on its kind')
  const project = source.slice(start, middle)
  const retainer = source.slice(middle, end)
  for (const part of ['AddSupportForm', 'endSupportAction', 'availableSupport']) assert.ok(project.includes(part), `${part} is in the project branch`)
  assert.ok(!project.includes('ChangeTierForm'), 'a project has no Change tier')
  assert.match(retainer, /<ChangeTierForm engagementId=\{pkg\.id\} tiers=\{pkg\.otherTiers/)
  for (const part of ['AddSupportForm', 'endSupportAction']) assert.ok(!retainer.includes(part), `a retainer has no ${part}`)
  assert.match(source, /\{pkg\.kind === 'retainer' \? \(\s*<p[^\n]*>\s*Active projects: \{pkg\.activeProjects\}\{pkg\.initiativeLimit \? ` of \$\{pkg\.initiativeLimit\} allowed` : ' \(no limit set for this tier\)'\}/)
})

test('the section builds no credit balance, expiry or automatic invoicing, and keeps the retainer options disabled with a hint when one is active', () => {
  assert.doesNotMatch(section() + forms(), /credit balance|remaining credits|expires|automatic/i, 'no control for things that are not built')
  assert.match(forms(), /<option key=\{o\.key\} value=\{o\.key\} disabled=\{hasActiveRetainer\}>/, 'retainer options are disabled while one is active')
  assert.match(
    forms(),
    /\{hasActiveRetainer \? <p[^\n]*>This client already has an active retainer\. Use Change tier to move them to another tier\.<\/p> : null\}/,
    'the hint is shown only while a retainer is active',
  )
})

test('the price list: rate card items are tagged, Edit is for custom items or an owner or admin, and Archive is never offered for a rate card item', () => {
  const source = screen()
  assert.match(source, /const canManageRates = role === 'owner' \|\| role === 'admin'/)
  assert.match(source, /\{item\.rate_key \? <span[^>]*>Rate card<\/span> : null\}/)
  assert.match(source, /\{item\.rate_status === 'proposed' \? <span[^>]*>Proposed rate<\/span> : null\}/)
  // The Edit link sits inside the gate; the Archive button sits inside it too, behind its own !item.rate_key condition.
  assert.match(
    source,
    /\{!item\.rate_key \|\| canManageRates \? \(\s*<div[^>]*>\s*<Link href=\{`\/settings\/price-list\?edit=\$\{item\.id\}`\}[^>]*>Edit<\/Link>\s*\{!item\.rate_key \? \(\s*<ActionButton\s+action=\{archivePriceItemAction\.bind\(null, item\.id\)\}[\s\S]*?\/>\s*\) : null\}\s*<\/div>\s*\) : null\}/,
  )
  assert.equal(source.match(/archivePriceItemAction/g)?.length, 2, 'one import and one gated button: no other way to archive from the screen')
  assert.match(source, /A rate card item can be edited here but not archived\./, 'an owner or admin is told why there is no Archive')
  assert.match(source, /Rate card items can only be changed by an owner or admin, and cannot be archived here\./, 'a member is told too')
  // The action itself only archives custom items, so a hand-made request for a rate card item finds nothing.
  const action = read('features', 'documents', 'actions', 'price-list.ts')
  const archive = action.slice(action.indexOf('export async function archivePriceItemAction'))
  assert.match(archive, /\.update\(\{ archived_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\('id', id\)\s*\.eq\('organization_id', organization\.id\)\s*\.is\('rate_key', null\)\s*\.select\('id'\)/)
})

test('a rate card item\'s VAT code is shown as fixed on the price list form, a custom item keeps the choice', () => {
  const source = read('features', 'documents', 'components', 'price-item-form.tsx')
  assert.match(source, /\{item\?\.rate_key \? \([\s\S]*?<input type="hidden" name="vatCode" value=\{item\.vat_code\} \/>[\s\S]*?\) : \(\s*<label[^>]*>\s*VAT\s*<select name="vatCode"/)
  assert.equal(source.match(/name="vatCode"/g)?.length, 2, 'one fixed value for a rate card item, one choice for a custom item')
})

test('a rate card item opened for editing by hand is not offered to a member', () => {
  const source = screen()
  assert.match(source, /const editing = requested && requested\.rate_key && !canManageRates \? null : requested/)
  assert.match(source, /<PriceItemForm key=\{`\$\{editing\?\.id \?\? 'new'\}-\$\{saved \?\? ''\}`\} item=\{editing\} \/>/, 'the form gets the guarded item')
})

test('saving a price item says why a rate card change was refused, and keeps the old wording for anything else', () => {
  const source = read('features', 'documents', 'actions', 'price-list.ts')
  assert.match(source, /import \{ documentErrorMessage \} from '\.\.\/errors'/)
  assert.match(source, /documentErrorMessage\(saved\.error\?\.message\) \?\? \(id \? 'That item no longer exists\.' : 'The item could not be saved\. Check the values and try again\.'\)/)
  assert.match(documentErrorMessage('new row violates RATE_CARD_ADMIN_ONLY')!, /Only an owner or admin can change a rate card price\./)
  assert.match(documentErrorMessage('RATE_CARD_FIXED')!, /cannot be changed/)
  assert.equal(documentErrorMessage('some other failure'), null, 'an unknown error falls back to the old text')
})

test('the picker lists custom items only: the default excludes the rate card and only the price list screen asks for it', () => {
  const source = query()
  assert.match(source, /listPriceItems\(options: \{ includeRateCard\?: boolean \} = \{\}\)/)
  assert.match(source, /if \(!options\.includeRateCard\) query = query\.is\('rate_key', null\)/)
  assert.match(source, /\.select\(COLUMNS\)\.eq\('organization_id', organization\.id\)\.is\('archived_at', null\)/)
  assert.match(screen(), /listPriceItems\(\{ includeRateCard: true \}\)/)

  const callers: string[] = []
  const withFlag: string[] = []
  for (const root of ['app', 'features']) {
    for (const file of readdirSync(join(process.cwd(), root), { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(file)) continue
      const text = read(root, file)
      const path = `${root}/${file.replace(/\\/g, '/')}`
      if (/includeRateCard/.test(text)) withFlag.push(path)
      for (const call of text.matchAll(/listPriceItems\(([^)]*)\)/g)) {
        if (!path.endsWith('queries/list-price-items.ts')) callers.push(`${path}: ${call[1]}`)
      }
    }
  }
  assert.deepEqual(withFlag.sort(), ['features/documents/components/price-list-screen.tsx', 'features/documents/queries/list-price-items.ts'], 'includeRateCard appears only in the query and the price list screen')
  const others = callers.filter((entry) => !entry.startsWith('features/documents/components/price-list-screen.tsx'))
  assert.ok(others.length >= 2, 'the quote and invoice pages still load the picker')
  for (const entry of others) assert.ok(entry.endsWith(': '), `${entry} asks for the default (custom items only)`)
})

test('a rate-locked line has no Edit control and no edit form, keeps Up, Down and Remove, and says it is a rate card price', () => {
  const source = editor()
  assert.match(source, /if \(editing && !locked && !line\.rate_locked\) \{/, 'the edit form never opens for a locked line')
  assert.equal(source.match(/setEditing\(true\)/g)?.length, 1, 'one way into the edit form')
  const gate = source.match(/\{line\.rate_locked \? null : \(\s*<button type="button" onClick=\{\(\) => setEditing\(true\)\}[^>]*>\s*Edit\s*<\/button>\s*\)\}/)
  assert.ok(gate, 'the Edit button is the only thing inside the rate_locked condition')
  const after = source.slice(source.indexOf(gate[0]) + gate[0].length, source.indexOf('function VatSelect'))
  assert.match(after, /moveLineAction\.bind\(null, kind, documentId, line\.id, 'up'\)/, 'Up stays outside the condition')
  assert.match(after, /moveLineAction\.bind\(null, kind, documentId, line\.id, 'down'\)/, 'Down stays outside the condition')
  assert.match(after, /removeLineAction\.bind\(null, kind, line\.id\)/, 'Remove stays outside the condition')
  assert.match(source, /\{line\.rate_locked \? <p[^>]*>Rate card price\. It cannot be changed here\.<\/p> : null\}/)
})
