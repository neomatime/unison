import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tokens = readFileSync('styles/tokens.css', 'utf8')
const theme = readFileSync('styles/unison.css', 'utf8')
const globals = readFileSync('styles/globals.css', 'utf8')
const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
const header = readFileSync('components/shared/workspace-header.tsx', 'utf8')
const button = readFileSync('components/ui/button.tsx', 'utf8')
const contentPanel = readFileSync('components/ui/content-panel.tsx', 'utf8')
const deliveryPrimitives = readFileSync('features/delivery/components/delivery-primitives.tsx', 'utf8')
const deliveryOverview = readFileSync('features/delivery/components/delivery-overview-components.tsx', 'utf8')
const collection = readFileSync('features/product-ui/components/record-collection-workspace.tsx', 'utf8')
const moduleWorkspace = readFileSync('features/product-ui/components/module-workspace.tsx', 'utf8')
const auth = readFileSync('features/auth-ui/auth-screen.tsx', 'utf8')

test('the tenant app owns a precise palette without leaking its theme into auth', () => {
  for (const [token, value] of [
    ['tenant-canvas', '#fafbfc'],
    ['tenant-surface', '#ffffff'],
    ['tenant-foreground', '#0a1d3f'],
    ['tenant-muted-foreground', '#637590'],
    ['tenant-border', '#dfe6ee'],
    ['tenant-brand', '#0968e8'],
  ]) {
    assert.match(tokens, new RegExp(`--${token}: ${value};`))
  }

  assert.match(shell, /className="unison-tenant /)
  assert.doesNotMatch(auth, /unison-tenant/)
})

test('the complete radius scale is near-sharp while circles remain available', () => {
  for (const radius of ['radius-lg', 'radius-xl', 'radius-2xl', 'radius-3xl', 'radius-4xl']) {
    assert.match(theme, new RegExp(`--${radius}: 4px;`))
  }

  assert.match(theme, /rounded-full remains available/)
  assert.doesNotMatch(deliveryOverview, /rounded-\[10px\]/)
})

test('brand typography is semantic and limited to strong interface hierarchy', () => {
  assert.match(tokens, /--unison-brand-font:/)
  assert.match(globals, /--font-brand: var\(--unison-brand-font\);/)
  assert.match(theme, /\.unison-page-title/)
  assert.match(theme, /\.unison-section-title/)
  assert.match(theme, /\.unison-metric-label/)
  assert.match(theme, /\.unison-record-name/)
  assert.match(header, /unison-page-title/)
  assert.match(contentPanel, /unison-section-title/)
  assert.match(deliveryPrimitives, /unison-metric-label/)
  assert.match(collection, /unison-record-name/)
  assert.match(moduleWorkspace, /unison-record-name/)
})

test('shared controls and surfaces use the restrained enterprise treatment', () => {
  assert.match(button, /rounded-sm/)
  assert.match(button, /default: 'bg-brand text-brand-foreground/)
  assert.doesNotMatch(contentPanel, /shadow-/)
  assert.doesNotMatch(deliveryPrimitives, /shadow-/)
  assert.match(theme, /:where\(input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), select, textarea\)/)
  assert.match(theme, /table thead/)
})
