import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { THEME_BOOT_SCRIPT, THEME_KEY, otherTheme, resolveTheme } from '../../lib/ui/theme.ts'

test('a saved choice wins; with none the device setting decides', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
  assert.equal(resolveTheme('something else', true), 'dark')
})

test('the toggle flips between the two themes', () => {
  assert.equal(otherTheme('dark'), 'light')
  assert.equal(otherTheme('light'), 'dark')
})

test('the boot script reads the saved key and adds the dark class, and cannot throw', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes(JSON.stringify(THEME_KEY)))
  assert.match(THEME_BOOT_SCRIPT, /classList\.add\('dark'\)/)
  assert.match(THEME_BOOT_SCRIPT, /try\{/)
})

test('dark mode is only switched on inside the signed-in workspace, and the dark colours exist', () => {
  const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
  const layout = readFileSync('app/layout.tsx', 'utf8')
  const unisonLayout = readFileSync('app/(unison)/layout.tsx', 'utf8')
  const tokens = readFileSync('styles/tokens.css', 'utf8')
  assert.match(shell, /<ThemeProvider>/)
  assert.doesNotMatch(layout, /THEME_BOOT_SCRIPT|ThemeProvider/, 'the root layout, shared with sign-in and the public pages, stays light')
  assert.match(unisonLayout, /THEME_BOOT_SCRIPT/)
  for (const token of ['--tenant-canvas', '--tenant-surface', '--tenant-foreground', '--tenant-border', '--tenant-brand', '--unison-canvas', '--unison-surface', '--unison-navy']) {
    assert.match(tokens.slice(tokens.indexOf(':root.dark')), new RegExp(`${token}:`), `${token} has a dark value`)
  }
})
