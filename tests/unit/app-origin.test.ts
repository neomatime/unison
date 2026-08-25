import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAppOrigin } from '../../lib/auth/app-origin.ts'

test('uses the configured application origin by default', () => {
  assert.equal(resolveAppOrigin('https://unison.example/app'), 'https://unison.example')
})

test('keeps the active loopback host and port for local previews', () => {
  assert.equal(
    resolveAppOrigin('http://localhost:3002', 'http://127.0.0.1:3000'),
    'http://127.0.0.1:3000',
  )
})

test('does not trust a non-loopback request origin', () => {
  assert.equal(
    resolveAppOrigin('https://unison.example', 'https://attacker.example'),
    'https://unison.example',
  )
})

test('falls back safely when the request origin is malformed', () => {
  assert.equal(resolveAppOrigin('https://unison.example', 'not a url'), 'https://unison.example')
})
