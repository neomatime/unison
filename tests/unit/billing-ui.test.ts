import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

test('the dead client setup file with the old prices is gone', () => {
  assert.equal(existsSync(join(process.cwd(), 'features', 'clients', 'components', 'client-setup-workflow.tsx')), false)
  assert.doesNotMatch(read('config', 'partner-levels.ts'), /185,?000|75,?000/, 'the old prices are not used anywhere')
})

test('the client page mounts the Billing package section for an active client', () => {
  const detail = read('features', 'clients', 'components', 'client-detail.tsx')
  assert.match(detail, /import \{ BillingPackageSection \} from '@\/features\/billing\/components\/billing-package-section'/)
  assert.match(detail, /<BillingPackageSection clientId=\{client\.id\} \/>/)
  assert.match(detail, /!archived/)
})

test('the section offers exactly the built things: package, first invoice or quote, monthly invoice, top-up, change tier, support, end', () => {
  const section = read('features', 'billing', 'components', 'billing-package-section.tsx')
  const forms = read('features', 'billing', 'components', 'billing-forms.tsx')
  for (const action of ['setPackageAction', 'changeTierAction', 'endEngagementAction', 'addSupportAction', 'endSupportAction', 'createFirstDocumentAction', 'createMonthlyInvoiceAction', 'createTopUpAction']) {
    assert.ok(section.includes(action) || forms.includes(action), `${action} is wired`)
  }
  assert.doesNotMatch(section + forms, /credit balance|remaining credits|expires/i, 'no control for credit balances, which are not built')
  assert.match(section, /Active projects/)
  assert.match(section, /no limit/i)
})

test('the price list marks rate card items, hides Edit and Archive from members, and the picker lists custom items only', () => {
  const screen = read('features', 'documents', 'components', 'price-list-screen.tsx')
  assert.match(screen, /Rate card/)
  assert.match(screen, /Proposed rate/)
  assert.match(screen, /canManageRates/)
  const query = read('features', 'documents', 'queries', 'list-price-items.ts')
  assert.match(query, /includeRateCard/)
  assert.match(query, /\.is\('rate_key', null\)/)
})

test('a locked line shows no edit control and says it is a rate card price', () => {
  const editor = read('features', 'documents', 'components', 'line-editor.tsx')
  assert.match(editor, /line\.rate_locked/)
  assert.match(editor, /Rate card price/)
})
