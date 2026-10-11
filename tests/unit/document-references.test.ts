import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  PACKAGE_NAMES,
  clientCode,
  nextReference,
  packageKeyForName,
  referenceYear,
  suggestClientRef,
  suggestProjectRef,
} from '../../features/commercial-finance/document-references.ts'

test('the Project name list holds the four retainers then the five projects, with the rate card names', () => {
  assert.deepEqual(
    PACKAGE_NAMES.map((entry) => entry.name),
    [
      'Signature Partner',
      'Growth Partner',
      'Private Partner',
      'HIMARK Reserve',
      'Operating Model & Operations Transformation',
      'Intelligence & AI Transformation',
      'Digital Experience',
      'Digital Presence',
      'Visual Communication & Operations',
    ],
  )
})

test('a listed name maps to its package whatever the case or spacing, and a custom name maps to none', () => {
  assert.equal(packageKeyForName('Growth Partner'), 'growth')
  assert.equal(packageKeyForName('  digital presence '), 'digital_presence')
  assert.equal(packageKeyForName('Growth Partner extra'), null)
  assert.equal(packageKeyForName(''), null)
})

test('the project reference is the package code, the year and the next free number', () => {
  assert.equal(suggestProjectRef('growth', 2026, []), 'GP-2026-001')
  assert.equal(suggestProjectRef('digital_presence', 2026, ['DP-2026-001', 'DP-2026-007', 'GP-2026-009']), 'DP-2026-008')
  assert.equal(suggestProjectRef('growth', 2027, ['GP-2026-004']), 'GP-2027-001', 'a new year starts again at 001')
  assert.equal(suggestProjectRef(null, 2026, []), '', 'a custom name has no code')
  assert.equal(suggestProjectRef('unknown_key', 2026, []), '')
})

test('every package has its own code', () => {
  const codes = PACKAGE_NAMES.map((entry) => suggestProjectRef(entry.key, 2026, []).slice(0, 2))
  assert.equal(new Set(codes).size, PACKAGE_NAMES.length)
  assert.ok(codes.every((code) => /^[A-Z]{2}$/.test(code)))
})

test('numbers other documents already use are skipped, and references that do not match the pattern are ignored', () => {
  const existing = ['GP-2026-003', 'GP-2026-12', 'PO-5521', null, undefined, 'XGP-2026-099', 'GP-2026-003-A']
  assert.equal(nextReference('GP', 2026, existing), 'GP-2026-013')
  assert.equal(nextReference('GP', 2026, ['GP-2026-999']), 'GP-2026-1000')
})

test('a client code is the initials without legal words, or the first four letters of a single word', () => {
  assert.equal(clientCode('Acme'), 'ACME')
  assert.equal(clientCode('Acme Holdings (Pty) Ltd'), 'AH')
  assert.equal(clientCode('Blue Rock Capital Partners Group'), 'BRCP')
  assert.equal(clientCode('Sasol'), 'SASO')
  assert.equal(clientCode('   '), '')
  assert.equal(clientCode('(Pty) Ltd'), '')
})

test('the client reference is the client code, the year and the next free number', () => {
  assert.equal(suggestClientRef('Acme Holdings (Pty) Ltd', 2026, []), 'AH-2026-001')
  assert.equal(suggestClientRef('Acme Holdings', 2026, ['AH-2026-001', 'AH-2026-002']), 'AH-2026-003')
  assert.equal(suggestClientRef('', 2026, []), '')
})

test('the reference year is the year in South Africa', () => {
  assert.equal(referenceYear(new Date('2026-12-31T23:30:00Z')), 2027, '01:30 on 1 January in South Africa')
  assert.equal(referenceYear(new Date('2026-06-15T10:00:00Z')), 2026)
})

test('the quote and invoice forms list the rate card names and fill the references only on a new document', () => {
  const form = readFileSync(join(process.cwd(), 'features', 'commercial-finance', 'components', 'phase-six-form.tsx'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal([...form.matchAll(/<ProjectIdentityFields kind="(quote|invoice)" identity=\{identity\} \/>/g)].length, 2, 'both forms use the shared fields')
  assert.match(form, /<NameCombobox\n\s+name="projectName"/)
  assert.match(form, /suggestions=\{PACKAGE_NAMES\.map\(\(entry\) => entry\.name\)\}/)
  assert.doesNotMatch(form, /<datalist/, 'the browser list cannot be styled, so the form uses its own list')
  assert.match(form, /label="Client reference"/)
  assert.doesNotMatch(form, /their PO number/)
  const hook = form.slice(form.indexOf('function useDocumentIdentity'))
  assert.match(hook, /const fresh = !record;/)
  assert.match(hook, /if \(fresh && !typed\.projectRef\)/, 'a typed project reference is never overwritten')
  assert.match(hook, /if \(!fresh \|\| typed\.clientRef\) return;/, 'a typed client reference is never overwritten')
  assert.match(hook, /if \(!fresh \|\| !details\) return;/, 'a quote only fills a new invoice')
})

test('the Client contact field is a list of the client contacts on both forms, fills from the client, and an invoice from a quote takes the quote contact', () => {
  const form = readFileSync(join(process.cwd(), 'features', 'commercial-finance', 'components', 'phase-six-form.tsx'), 'utf8').replace(/\r\n/g, '\n')
  assert.match(form, /<ClientContactField kind="quote" identity=\{identity\} \/>/)
  assert.match(form, /<ClientContactField kind="invoice" identity=\{identity\} \/>/)
  assert.doesNotMatch(form, /<Field name="contactName" label="Client contact"/, 'no plain text field is left, so the browser has no history to autofill from')
  assert.match(form, /if \(fresh && !typed\.contactName\) setContactName\(options\.contactsByClient\[id\]\?\.\[0\] \?\? ""\)/, 'the primary contact fills in, unless one was typed')
  assert.match(form, /if \(details\.contactName && !typed\.contactName\) setContactName\(details\.contactName\)/)
  const query = readFileSync(join(process.cwd(), 'features', 'commercial-finance', 'queries', 'phase-six.ts'), 'utf8').replace(/\r\n/g, '\n')
  assert.match(query, /\.from\("contacts"\)\.select\("client_id,full_name"\)/)
  assert.match(query, /\.is\("archived_at", null\)\.order\("is_primary", \{ ascending: false \}\)/, 'archived contacts are not offered and the primary comes first')
  const action = readFileSync(join(process.cwd(), 'features', 'commercial-finance', 'actions', 'phase-six.ts'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal([...action.matchAll(/contact_name: contact,/g)].length, 2, 'a draft quote and a draft invoice both save the contact')
  assert.equal([...action.matchAll(/contact\.length > 200/g)].length, 2)
})
