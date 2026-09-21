import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const source = (...parts: string[]) => readFileSync(join(workspace, ...parts), 'utf8')

test('the interaction system has shared motion, focus and reduced-motion safeguards', () => {
  const tokens = source('styles', 'tokens.css')
  const styles = source('styles', 'unison.css')
  assert.match(tokens, /--motion-instant/)
  assert.match(tokens, /--shadow-interactive/)
  assert.match(styles, /\.unison-action-control/)
  assert.match(styles, /\.unison-interactive-card/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /\.unison-live-region/)
  assert.match(styles, /box-shadow: inset 3px 0 0 var\(--tenant-brand\)/)
  assert.match(styles, /\[role='tab'\]\[aria-selected='true'\]/)
})

test('shared controls communicate pending, focus and disabled states', () => {
  const button = source('components', 'ui', 'button.tsx')
  const fields = source('components', 'ui', 'form-fields.tsx')
  const footer = source('components', 'ui', 'form-layout.tsx')
  assert.match(button, /aria-busy:pointer-events-none/)
  assert.match(button, /focus-visible:ring-2/)
  assert.match(fields, /aria-invalid:border-destructive/)
  assert.match(fields, /disabled:cursor-not-allowed/)
  assert.match(footer, /aria-busy=\{pending/)
})

test('menus, drawers and confirmations provide keyboard escape hatches', () => {
  const menu = source('components', 'shared', 'row-action-menu.tsx')
  const dialog = source('components', 'shared', 'confirmation-dialog.tsx')
  const drawer = source('components', 'shared', 'utility-panel.tsx')
  assert.match(menu, /ArrowDown/)
  assert.match(menu, /aria-controls/)
  assert.match(dialog, /previousFocus/)
  assert.match(dialog, /event\.key !== 'Tab'/)
  assert.match(drawer, /event\.key === 'Escape'/)
})

test('registers expose row and state feedback affordances', () => {
  const workspaceSource = source('features', 'product-ui', 'components', 'record-collection-workspace.tsx')
  assert.match(workspaceSource, /className="group border-t border-border hover:bg-muted\/25"/)
  assert.match(workspaceSource, /role="status" aria-live="polite"/)
  assert.match(workspaceSource, /unison-action-control/)
  const primitives = source('features', 'delivery', 'components', 'delivery-primitives.tsx')
  assert.match(primitives, /before:bg-brand/)
  assert.match(primitives, /size-1\.5 rounded-full bg-current\/70/)
})
