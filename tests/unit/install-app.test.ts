import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const pngSize = (path: string) => {
  const bytes = readFileSync(path)
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test('the web app manifest makes UNISON installable: name, start page, standalone window and the three icons', () => {
  const manifest = read('app/manifest.ts')
  assert.match(manifest, /display: 'standalone'/)
  assert.match(manifest, /start_url: '\/overview'/)
  assert.match(manifest, /short_name: application\.name/)
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]] as const) {
    assert.ok(existsSync(`public/icons/${file}`), `${file} is missing`)
    assert.deepEqual(pngSize(`public/icons/${file}`), [size, size], `${file} must be ${size} px square`)
    assert.match(manifest, new RegExp(`/icons/${file}`))
  }
  assert.match(manifest, /purpose: 'maskable'/)
})

test('the manifest is outside the sign-in redirect, or the browser would get a sign-in page instead of a manifest', () => {
  const literal = read('proxy.ts').match(/matcher:\s*\[\s*'([^']+)'\s*\]/)?.[1]
  assert.ok(literal)
  const matcher = new RegExp(`^${literal.replace(/\\\\/g, '\\')}$`)
  assert.equal(matcher.test('/manifest.webmanifest'), false)
  assert.equal(matcher.test('/overview'), true)
})

test('the install button shows only when the browser offers the prompt and the app is not already installed', () => {
  const hook = read('components/layout/install-app.tsx')
  assert.match(hook, /addEventListener\('beforeinstallprompt'/)
  assert.match(hook, /addEventListener\('appinstalled'/)
  assert.match(hook, /display-mode: standalone/)
  assert.match(hook, /canInstall: available && !installed/)
  const actions = read('components/layout/utility-actions.tsx')
  assert.match(actions, /canInstall \? \(/)
  assert.match(actions, /Install UNISON as an app/)
})

test('Help explains how to install in browsers that never show the prompt', () => {
  const panel = read('components/shared/utility-panel.tsx')
  assert.match(panel, /Install UNISON as an app/)
  assert.match(panel, /Add to Home Screen/)
})
