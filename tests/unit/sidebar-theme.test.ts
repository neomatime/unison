import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('the tenant shell uses its light neutral palette without recolouring internal or auth surfaces', () => {
  const tokens = readFileSync('styles/tokens.css', 'utf8')
  const globals = readFileSync('styles/globals.css', 'utf8')
  const sidebar = readFileSync('components/navigation/sidebar.tsx', 'utf8')
  const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
  const internalSidebar = readFileSync('components/internal/internal-sidebar.tsx', 'utf8')
  const internalShell = readFileSync('components/internal/internal-app-shell.tsx', 'utf8')
  const authScreen = readFileSync('features/auth-ui/auth-screen.tsx', 'utf8')

  for (const [token, value] of [
    ['tenant-sidebar', '#f6f8fa'],
    ['tenant-sidebar-foreground', '#1c2b3a'],
    ['tenant-sidebar-muted', '#5c6f82'],
    ['tenant-sidebar-active', '#eaf2fd'],
    ['tenant-sidebar-hover', '#eef3f7'],
    ['tenant-sidebar-border', '#e1e7ec'],
    ['tenant-canvas', '#fafbfc'],
  ]) {
    assert.match(tokens, new RegExp(`--${token}: ${value};`))
  }

  assert.match(globals, /--color-tenant-canvas: var\(--tenant-canvas\);/)
  assert.match(sidebar, /border-r border-tenant-sidebar-border bg-tenant-sidebar text-tenant-sidebar-foreground/)
  assert.match(sidebar, /bg-tenant-sidebar-active text-tenant-sidebar-foreground/)
  assert.match(sidebar, /text-tenant-sidebar-muted hover:bg-tenant-sidebar-hover hover:text-tenant-sidebar-foreground/)
  assert.match(sidebar, /absolute inset-y-0 -left-3 w-0\.5 rounded-r-full bg-brand/)
  assert.match(sidebar, /collapsed \? 'w-20' : 'w-64'/)
  assert.match(sidebar, /useNavigationSections\(\)/)
  assert.match(sidebar, /moduleIcons\[item\.id\]/)
  assert.match(shell, /bg-tenant-canvas/)
  assert.match(shell, /border-b border-tenant-sidebar-border bg-tenant-sidebar/)
  assert.match(shell, /hidden lg:block/)
  assert.match(shell, /fixed inset-0 z-50 lg:hidden/)
  assert.match(shell, /h-screen h-dvh/)
  assert.match(shell, /role="dialog"/)
  assert.match(shell, /aria-modal="true"/)
  assert.match(shell, /aria-label="Primary navigation"/)
  assert.match(shell, /event\.key === 'Escape'/)
  assert.match(shell, /navigationCloseRef\.current\?\.focus\(\)/)
  assert.match(shell, /navigationTriggerRef\.current\?\.focus\(\)/)
  assert.match(shell, /<Sidebar onNavigate=/)
  assert.match(sidebar, /onNavigate\?\.\(\)/)
  assert.match(sidebar, /onSubmit=\{onNavigate\}/)
  assert.doesNotMatch(shell, /lg:rounded-l-2xl/)
  assert.match(internalSidebar, /bg-sidebar text-sidebar-foreground/)
  assert.doesNotMatch(internalSidebar, /tenant-sidebar/)
  assert.match(internalShell, /bg-sidebar/)
  assert.doesNotMatch(internalShell, /tenant-sidebar|tenant-canvas/)
  assert.match(authScreen, /bg-sidebar/)
  assert.doesNotMatch(authScreen, /tenant-sidebar|tenant-canvas/)
})
