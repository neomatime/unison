import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loader = readFileSync('components/shared/system-loading.tsx', 'utf8')
const navigation = readFileSync('components/shared/navigation-loading.tsx', 'utf8')
const theme = readFileSync('styles/unison.css', 'utf8')

const boundaries = [
  'app/(auth)/loading.tsx',
  'app/(internal)/internal/loading.tsx',
  'app/(onboarding)/loading.tsx',
  'app/(unison)/loading.tsx',
  'app/(unison)/operations/projects/loading.tsx',
  'app/(unison)/operations/clients/loading.tsx',
  'app/(unison)/delivery/frameworks/loading.tsx',
  'app/(unison)/settings/loading.tsx',
]

test('every route loading boundary uses the shared system loader', () => {
  for (const path of boundaries) {
    assert.match(readFileSync(path, 'utf8'), /SystemLoading/, `${path} bypasses the shared loading mechanism`)
  }
})

test('the shared loader is accessible and preserves a recognizable workspace shape', () => {
  assert.match(loader, /role="status"/)
  assert.match(loader, /aria-live="polite"/)
  assert.match(loader, /aria-busy="true"/)
  assert.match(loader, /xl:grid-cols-\[1\.25fr_0\.75fr\]/)
  assert.match(loader, /divide-y divide-border/)
})

test('loading motion is branded, restrained and gradient-free', () => {
  assert.match(navigation, /unison-navigation-progress/)
  assert.match(theme, /\.unison-luxury-skeleton/)
  assert.match(theme, /\.unison-loading-ring/)
  assert.match(theme, /\.unison-loading-dot/)
  assert.doesNotMatch(loader + navigation + theme, /linear-gradient|radial-gradient|bg-gradient/)
})
