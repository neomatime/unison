import assert from 'node:assert/strict'
import test from 'node:test'

import { appliesToKind, currentVersion, saToday, termsTargetsFor, upcomingVersion, type SelectableVersion } from '../../features/terms/selection.ts'

const v = (version: number, status: SelectableVersion['status'], effectiveFrom: string | null): SelectableVersion => ({ version, status, effectiveFrom })

test('the current version is the approved one with the latest effective date that has arrived', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'approved', '2026-06-01'), v(3, 'draft', null)]
  assert.equal(currentVersion(versions, '2026-10-12')?.version, 2)
})

test('a future-dated approved version is skipped until its date, and is the upcoming one meanwhile', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'approved', '2026-11-01')]
  assert.equal(currentVersion(versions, '2026-10-31')?.version, 1)
  assert.equal(upcomingVersion(versions, '2026-10-31')?.version, 2)
  assert.equal(currentVersion(versions, '2026-11-01')?.version, 2, 'it becomes current on its effective date')
  assert.equal(upcomingVersion(versions, '2026-11-01'), null)
})

test('drafts and archived versions are never current', () => {
  assert.equal(currentVersion([v(1, 'draft', '2026-01-01'), v(2, 'archived', '2026-01-01')], '2026-10-12'), null)
})

test('archiving the newest version falls back to an older approved one', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'archived', '2026-06-01')]
  assert.equal(currentVersion(versions, '2026-10-12')?.version, 1)
})

test('on the same effective date the higher version number wins', () => {
  assert.equal(currentVersion([v(1, 'approved', '2026-05-01'), v(2, 'approved', '2026-05-01')], '2026-10-12')?.version, 2)
})

test('an approved version without an effective date is ignored rather than guessed', () => {
  assert.equal(currentVersion([v(1, 'approved', null)], '2026-10-12'), null)
})

test('with several upcoming versions the earliest is the upcoming one', () => {
  assert.equal(upcomingVersion([v(1, 'approved', '2026-12-01'), v(2, 'approved', '2026-11-01')], '2026-10-12')?.version, 2)
})

test('saToday uses the South African date, not the UTC date', () => {
  assert.equal(saToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01', '01:30 on 1 January in South Africa')
  assert.equal(saToday(new Date('2026-06-15T10:00:00Z')), '2026-06-15')
  assert.equal(saToday(new Date('2026-06-15T21:59:00Z')), '2026-06-15')
  assert.equal(saToday(new Date('2026-06-15T22:00:00Z')), '2026-06-16', '00:00 SAST is 22:00 UTC the day before')
})

test('the company terms always come first, then the offering, then the category when one is given', () => {
  assert.deepEqual(termsTargetsFor(null), [{ layer: 'company', targetKind: 'company', targetKey: null }])
  assert.deepEqual(termsTargetsFor({ kind: 'retainer', key: 'growth' }), [
    { layer: 'company', targetKind: 'company', targetKey: null },
    { layer: 'offering', targetKind: 'retainer', targetKey: 'growth' },
  ])
  assert.deepEqual(termsTargetsFor({ kind: 'support', key: 'website_care', categoryKey: 'digital_presence' }), [
    { layer: 'company', targetKind: 'company', targetKey: null },
    { layer: 'offering', targetKind: 'support', targetKey: 'website_care' },
    { layer: 'category', targetKind: 'project', targetKey: 'digital_presence' },
  ])
})

test('a template applies to a document kind when it is for that kind or for both', () => {
  assert.equal(appliesToKind('quote', 'quote'), true)
  assert.equal(appliesToKind('both', 'invoice'), true)
  assert.equal(appliesToKind('invoice', 'quote'), false)
})
