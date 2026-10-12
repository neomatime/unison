import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { RATE_CARD } from '../../features/billing/rate-card.ts'
import { TERMS_PLACEHOLDERS, placeholderProblems, placeholdersIn } from '../../features/terms/placeholders.ts'
import { resolveTerms } from '../../features/terms/resolve-terms.ts'
import { COMPANY_SEED, SEED_EFFECTIVE_FROM, SEED_TEMPLATES } from '../../features/terms/seed-wording.ts'
import { buildPlaceholderValues } from '../../features/terms/values.ts'

const money = (amount: number) => `R${amount}`

test('buildPlaceholderValues turns numbers into text and leaves what is unknown as null', () => {
  assert.deepEqual(
    buildPlaceholderValues({ retainer: { monthlyFee: 100000, credits: 40, initiativeLimit: 2 }, validDays: 30, paymentDays: 14, formatMoney: money }),
    { monthly_fee: 'R100000', monthly_credits: '40', initiative_limit: '2', valid_days: '30', payment_days: '14' },
  )
  assert.deepEqual(
    buildPlaceholderValues({ retainer: { monthlyFee: 300000, credits: 220, initiativeLimit: null }, validDays: null, paymentDays: null, formatMoney: money }),
    { monthly_fee: 'R300000', monthly_credits: '220', initiative_limit: null, valid_days: null, payment_days: null },
  )
  assert.deepEqual(buildPlaceholderValues({ validDays: 30, paymentDays: 30, formatMoney: money }), {
    monthly_fee: null, monthly_credits: null, initiative_limit: null, valid_days: '30', payment_days: '30',
  })
  assert.equal(buildPlaceholderValues({ retainer: { monthlyFee: 1, credits: 12.5, initiativeLimit: null }, validDays: 1, paymentDays: 1, formatMoney: money }).monthly_credits, '12.5', 'a fractional credit count is not truncated')
})

test('the seed holds 4 retainer tiers, 6 project categories and the 10 rate card support services, each once', () => {
  const count = (kind: string) => SEED_TEMPLATES.filter((item) => item.targetKind === kind).length
  assert.equal(count('retainer'), 4)
  assert.equal(count('project'), 6)
  assert.equal(count('support'), 10)
  assert.equal(new Set(SEED_TEMPLATES.map((item) => `${item.targetKind}:${item.targetKey}`)).size, SEED_TEMPLATES.length)
  assert.deepEqual(SEED_TEMPLATES.filter((item) => item.targetKind === 'retainer').map((item) => item.targetKey), ['signature', 'growth', 'private', 'reserve'])
  assert.ok(SEED_TEMPLATES.some((item) => item.targetKind === 'project' && item.targetKey === 'strategic_consulting'), 'Strategic Consulting is terms-only: it has no rate card row')
  const supportKeys = RATE_CARD.filter((item) => item.kind === 'support').map((item) => item.key.replace('support.', ''))
  assert.deepEqual(SEED_TEMPLATES.filter((item) => item.targetKind === 'support').map((item) => item.targetKey).sort(), [...supportKeys].sort())
  assert.equal(SEED_EFFECTIVE_FROM, '2026-10-12')
  assert.deepEqual(COMPANY_SEED.map((item) => item.appliesTo), ['quote', 'invoice'])
})

test('every seeded text uses only allowed placeholders', () => {
  for (const item of SEED_TEMPLATES) {
    assert.deepEqual(placeholderProblems(item.body), [], `${item.title} body`)
    assert.deepEqual(placeholderProblems(item.inclusions), [], `${item.title} inclusions`)
  }
})

test('support services are seeded empty: the brief gives no wording for them', () => {
  for (const item of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'support')) {
    assert.equal(item.body, '', item.title)
    assert.equal(item.inclusions, '', item.title)
  }
})

test('each retainer resolves against the rate card with nothing missing and nothing skipped', () => {
  for (const tier of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'retainer')) {
    const monthly = RATE_CARD.find((item) => item.key === `retainer.${tier.targetKey}.monthly`)!
    const values = buildPlaceholderValues({
      retainer: { monthlyFee: monthly.price, credits: monthly.credits, initiativeLimit: monthly.initiativeLimit },
      validDays: 30, paymentDays: 30, formatMoney: money,
    })
    const result = resolveTerms({ layers: [{ layer: 'offering', templateId: 't', versionId: 'v', version: 1, body: tier.body, inclusions: tier.inclusions }], values })
    assert.deepEqual(result.missing, [], tier.title)
    assert.deepEqual(result.skipped, [], tier.title)
    assert.ok(result.lines.length >= 7, `${tier.title} has its terms`)
    assert.ok(result.inclusions.length >= 5, `${tier.title} lists its service inclusions`)
    assert.ok(result.lines.some((line) => line.includes(`R${monthly.price} monthly retainer includes ${monthly.credits} monthly credits`)), `${tier.title} shows its own fee and credits`)
  }
})

test('the initiative limit comes from the rate card, so Signature, Growth and Private say 2, 4 and 6', () => {
  const lineFor = (key: string) => {
    const tier = SEED_TEMPLATES.find((entry) => entry.targetKey === key)!
    const monthly = RATE_CARD.find((item) => item.key === `retainer.${key}.monthly`)!
    const values = buildPlaceholderValues({ retainer: { monthlyFee: monthly.price, credits: monthly.credits, initiativeLimit: monthly.initiativeLimit }, validDays: 30, paymentDays: 30, formatMoney: money })
    return resolveTerms({ layers: [{ layer: 'offering', templateId: 't', versionId: 'v', version: 1, body: tier.body, inclusions: '' }], values }).lines[0]
  }
  assert.match(lineFor('signature'), /up to 2 agreed active business priorities/)
  assert.match(lineFor('growth'), /up to 4 agreed active initiatives/)
  assert.match(lineFor('private'), /up to 6 agreed active initiatives/)
})

test('HIMARK Reserve has no initiative limit, so its wording must not use that placeholder', () => {
  const reserve = SEED_TEMPLATES.find((entry) => entry.targetKey === 'reserve')!
  assert.deepEqual(placeholdersIn(reserve.body).filter((name) => name === 'initiative_limit'), [])
})

test('every project category has its own terms and none of them adds a monthly maintenance fee', () => {
  for (const item of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'project')) {
    assert.ok(item.body.split('\n').length >= 4, `${item.title} has its clauses`)
    assert.doesNotMatch(item.body, /Do not automatically add/i, 'the builder instruction is not client wording')
  }
})

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('the placeholder list in the database function equals the one in TypeScript', () => {
  const sql = read('supabase', 'migrations', '20261012160000_commercial_terms.sql')
  const line = sql.split('\n').find((entry) => entry.includes('regexp_replace(') && entry.includes('\\{\\{('))
  assert.ok(line, 'terms_text_valid strips the known placeholders with a regexp_replace')
  const group = /\\\{\\\{\(([^)]*)\)\\\}\\\}/.exec(line)
  assert.ok(group, 'the alternation group sits between {{( and )}}')
  assert.deepEqual(group[1].split('|'), [...TERMS_PLACEHOLDERS])
})

test('the seed migration carries exactly the wording in features/terms/seed-wording.ts', () => {
  const sql = read('supabase', 'migrations', '20261012161000_commercial_terms_seed.sql')
  const match = sql.match(/\$terms_seed\$(\[[\s\S]*?\])\$terms_seed\$/)
  assert.ok(match, 'the seed JSON is present')
  const seeded = JSON.parse(match[1]) as Array<Record<string, string>>
  assert.deepEqual(
    seeded,
    SEED_TEMPLATES.map((item) => ({ target_kind: item.targetKind, target_key: item.targetKey, applies_to: item.appliesTo, title: item.title, body: item.body, inclusions: item.inclusions })),
  )
  assert.ok(sql.includes(`date '${SEED_EFFECTIVE_FROM}'`))
  for (const company of COMPANY_SEED) assert.ok(sql.includes(company.title))
  assert.match(sql, /grant execute on function public\.seed_commercial_terms\(uuid\) to service_role/)
  assert.match(sql, /revoke all on function public\.seed_commercial_terms\(uuid\) from public, anon, authenticated/)
  assert.match(sql, /00000000-0000-4000-8000-000000000001/, 'the HIMARK organisation is seeded')
})
