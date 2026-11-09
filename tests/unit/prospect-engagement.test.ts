import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import jsQR from 'jsqr'
import { PNG } from 'pngjs'

import { qrPng } from '../../features/prospect-engagement/qr-code.ts'

const schemaSource = readFileSync(join(process.cwd(), 'features', 'prospect-engagement', 'schema.ts'), 'utf8')

test('prospect engagement schema pins consent, idempotency, and attribution inputs', () => {
  assert.match(schemaSource, /submissionKey: z\.uuid\(\)/)
  assert.match(schemaSource, /privacyAcknowledged: z\.literal\(true\)/)
  assert.match(schemaSource, /sourceToken: sourceToken\.nullable\(\)/)
  assert.match(schemaSource, /marketingConsent: z\.boolean\(\)/)
})

test('prospect engagement schema enforces the cross-field selection and contact rules', () => {
  assert.match(schemaSource, /uniqueServices\.has\('not-sure'\) && uniqueServices\.size > 1/)
  assert.match(schemaSource, /objectiveIds\.has\(value\.primaryObjective/)
  assert.match(schemaSource, /value\.contactPreference === 'telephone' && !value\.phone/)
})

test('public form configuration requires an HTTPS privacy notice', () => {
  assert.match(schemaSource, /startsWith\('https:\/\/'\)/)
})

test('generated acquisition QR PNG decodes to the exact signed-out engagement URL', async () => {
  const url = 'https://unison.himark.co.za/engage?source=Event_2026-A'
  const image = PNG.sync.read(await qrPng(url, 720))
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height)
  assert.equal(decoded?.data, url)
})
