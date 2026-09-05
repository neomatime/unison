import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the tenant sidebar uses the calm slate and ocean palette without recolouring internal surfaces', () => {
  const tokens = readFileSync('styles/tokens.css', 'utf8')
  const sidebar = readFileSync('components/navigation/sidebar.tsx', 'utf8')
  const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
  const internalSidebar = readFileSync('components/internal/internal-sidebar.tsx', 'utf8')

  for (const [token, value] of [
    ['tenant-sidebar', '#1c2b3a'],
    ['tenant-sidebar-foreground', '#f7f7f5'],
    ['tenant-sidebar-muted', '#9fb0ba'],
    ['tenant-sidebar-active', '#2e4a5a'],
    ['tenant-sidebar-border', '#223746'],
  ]) {
    assert.match(tokens, new RegExp(`--${token}: ${value};`))
  }

  assert.match(sidebar, /bg-tenant-sidebar text-tenant-sidebar-foreground/)
  assert.match(sidebar, /bg-tenant-sidebar-active text-tenant-sidebar-foreground/)
  assert.match(shell, /bg-tenant-sidebar/)
  assert.match(internalSidebar, /bg-sidebar text-sidebar-foreground/)
  assert.doesNotMatch(internalSidebar, /tenant-sidebar/)
})
