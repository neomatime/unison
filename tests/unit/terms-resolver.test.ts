import assert from 'node:assert/strict'
import test from 'node:test'

import { TERMS_PLACEHOLDERS, fillPlaceholders, placeholderProblems, placeholdersIn } from '../../features/terms/placeholders.ts'
import { resolveTerms, splitTermsLines, type ResolvedLayer } from '../../features/terms/resolve-terms.ts'

const layer = (over: Partial<ResolvedLayer> & Pick<ResolvedLayer, 'layer' | 'body'>): ResolvedLayer => ({
  templateId: `t-${over.layer}`, versionId: `v-${over.layer}`, version: 1, inclusions: '', ...over,
})

test('the placeholder names are exactly the five the spec allows', () => {
  assert.deepEqual([...TERMS_PLACEHOLDERS], ['monthly_fee', 'monthly_credits', 'initiative_limit', 'valid_days', 'payment_days'])
})

test('placeholdersIn lists each placeholder once, in order of first use', () => {
  assert.deepEqual(placeholdersIn('{{monthly_credits}} and {{monthly_fee}} and {{monthly_credits}}'), ['monthly_credits', 'monthly_fee'])
  assert.deepEqual(placeholdersIn('no placeholders here'), [])
})

test('placeholderProblems accepts the exact names and rejects everything else in braces', () => {
  assert.deepEqual(placeholderProblems('The {{monthly_fee}} fee and {{payment_days}} days'), [])
  assert.deepEqual(placeholderProblems('{{unknown_name}}'), ['{{unknown_name}}'])
  assert.deepEqual(placeholderProblems('{{ monthly_fee }}'), ['{{ monthly_fee }}'], 'spaces inside the braces are not accepted')
  assert.deepEqual(placeholderProblems('{{Monthly_Fee}}'), ['{{Monthly_Fee}}'], 'names are lower case')
  assert.deepEqual(placeholderProblems('half open {{ here'), ['{{'])
  assert.deepEqual(placeholderProblems('stray }} here'), ['}}'])
  assert.deepEqual(placeholderProblems('{{ and half closed }}'), ['{{ and half closed }}'], 'braces around other text are one bad placeholder')
  assert.deepEqual(placeholderProblems(''), [])
})

test('fillPlaceholders fills known values and reports a missing one without printing braces', () => {
  assert.deepEqual(fillPlaceholders('{{monthly_credits}} credits', { monthly_credits: '40' }), { text: '40 credits', missing: [] })
  assert.deepEqual(fillPlaceholders('up to {{initiative_limit}}', { initiative_limit: null }), { text: 'up to {{initiative_limit}}', missing: ['initiative_limit'] })
  assert.deepEqual(fillPlaceholders('up to {{initiative_limit}}', {}).missing, ['initiative_limit'])
  assert.deepEqual(fillPlaceholders('{{valid_days}}', { valid_days: '' }).missing, ['valid_days'], 'an empty value counts as missing')
})

test('splitTermsLines trims, drops blank lines and copes with Windows and old Mac line endings', () => {
  assert.deepEqual(splitTermsLines('  one  \r\n\r\ntwo\rthree\n\n   \n'), ['one', 'two', 'three'])
  assert.deepEqual(splitTermsLines(''), [])
})

test('layers are combined in the given order and a clause repeated in a later layer appears once', () => {
  const result = resolveTerms({
    values: {},
    layers: [
      layer({ layer: 'company', body: 'All prices exclude VAT.\nQuotes are valid for a limited time.' }),
      layer({ layer: 'offering', body: 'all   prices EXCLUDE vat.\nSpecific to the offering.' }),
    ],
  })
  assert.deepEqual(result.lines, ['All prices exclude VAT.', 'Quotes are valid for a limited time.', 'Specific to the offering.'])
  assert.deepEqual(result.sources.map((source) => [source.layer, source.templateId, source.versionId, source.version]), [
    ['company', 't-company', 'v-company', 1], ['offering', 't-offering', 'v-offering', 1],
  ])
})

test('inclusions are kept apart from the terms and de-duplicated the same way', () => {
  const result = resolveTerms({
    values: {},
    layers: [
      layer({ layer: 'company', body: 'Term A.', inclusions: '' }),
      layer({ layer: 'offering', body: 'Term B.', inclusions: 'Dedicated lead\nRoadmap\ndedicated  LEAD' }),
    ],
  })
  assert.deepEqual(result.lines, ['Term A.', 'Term B.'])
  assert.deepEqual(result.inclusions, ['Dedicated lead', 'Roadmap'])
})

test('placeholders are filled from the values, and a line whose value is missing is skipped, never printed with braces', () => {
  const result = resolveTerms({
    values: { monthly_fee: 'R100 000,00', monthly_credits: '40', initiative_limit: null },
    layers: [layer({ layer: 'offering', body: 'The {{monthly_fee}} retainer includes {{monthly_credits}} credits.\nUp to {{initiative_limit}} initiatives.\nPlain line.' })],
  })
  assert.deepEqual(result.lines, ['The R100 000,00 retainer includes 40 credits.', 'Plain line.'])
  assert.deepEqual(result.missing, ['initiative_limit'])
  assert.deepEqual(result.skipped, ['Up to {{initiative_limit}} initiatives.'])
  assert.ok(result.lines.every((line) => !line.includes('{{')), 'no braces reach the output')
})

test('missing placeholders are listed once, in the order of the allowed list', () => {
  const result = resolveTerms({
    values: {},
    layers: [layer({ layer: 'offering', body: '{{payment_days}} days.\n{{monthly_fee}}.\n{{payment_days}} again.' })],
  })
  assert.deepEqual(result.missing, ['monthly_fee', 'payment_days'])
  assert.equal(result.skipped.length, 3)
})

test('no layers, or empty layers, give an empty result', () => {
  assert.deepEqual(resolveTerms({ layers: [], values: {} }), { lines: [], inclusions: [], sources: [], missing: [], skipped: [] })
  const empty = resolveTerms({ layers: [layer({ layer: 'company', body: '  \r\n ' })], values: {} })
  assert.deepEqual(empty.lines, [])
  assert.equal(empty.sources.length, 1, 'the layer is still a source even when it contributes no lines')
})
