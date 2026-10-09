import assert from 'node:assert/strict'
import test from 'node:test'

import { getPartnerLevel, partnerLevels } from '../../config/partner-levels.ts'

test('the four partner levels carry their agreed rand prices', () => {
  assert.deepEqual(
    partnerLevels.map((level) => [level.label, level.price]),
    [['Signature Partner', 100_000], ['Growth Partner', 150_000], ['Private Partner', 200_000], ['HIMARK Reserve', 300_000]],
  )
})

test('an unknown or missing level resolves to nothing rather than a default', () => {
  assert.equal(getPartnerLevel(null), null)
  assert.equal(getPartnerLevel('gold'), null)
  assert.equal(getPartnerLevel('growth')?.label, 'Growth Partner')
})
