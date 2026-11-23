import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const size = (path: string) => {
  const bytes = readFileSync(path)
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test('both wordmark files exist, with the same shape', () => {
  for (const file of ['unison-wordmark.png', 'unison-wordmark-white.png']) {
    assert.ok(existsSync(`public/brand/${file}`), `${file} is missing`)
    assert.deepEqual(size(`public/brand/${file}`), [1000, 96])
  }
})

test('the landing page, sign-in and invitation screens use the wordmark image, not drawn text', () => {
  for (const file of ['features/marketing/components/landing-page.tsx', 'features/marketing/components/client-preview.tsx', 'features/invitations/components/invitation-signup-screen.tsx']) {
    const source = read(file)
    assert.match(source, /UnisonWordmark/, `${file} should use the wordmark image`)
    assert.doesNotMatch(source, />UNISON<\/(?:Link|span|p)>/, `${file} still draws the wordmark as text`)
  }
  const auth = read('features/auth-ui/auth-screen.tsx')
  assert.match(auth, /UnisonWordmark/)
  // Forgot and reset password were left as they were: their wordmark is still text.
  assert.match(auth, /const useBrand = !isForgot && !isReset/)
  assert.match(auth, /tracking-\[0\.28em\][^"]*">UNISON<\/Link>/)
})

test('the signed-in sidebar shows the UNISON wordmark (as asked on 2026-11-23), at a size that fits beside the menu button', () => {
  const sidebar = read('components/navigation/sidebar.tsx')
  assert.match(sidebar, /<UnisonWordmark className="h-3\.5" \/>/)
  assert.doesNotMatch(sidebar, /tracking-\[0\.2em\][\s\S]{0,120}>\s*UNISON\s*</, 'the plain text logo is gone')
  assert.doesNotMatch(read('components/layout/app-shell.tsx'), /UnisonWordmark/)
})

test('the sign-in and landing logos are the smaller size', () => {
  assert.match(read('features/auth-ui/auth-screen.tsx'), /<UnisonWordmark className="h-4" priority \/>/)
  assert.match(read('features/marketing/components/landing-page.tsx'), /<UnisonWordmark className="h-3\.5 sm:h-4" priority \/>/)
})

test('dark mode applies to the public pages only through the shared theme, and is taken off again', () => {
  assert.match(read('components/layout/public-theme-effect.tsx'), /root\.classList\.remove\('dark'\)/)
  const css = read('styles/public-theme.css')
  assert.match(css, /:root\.dark \{/)
  assert.match(css, /--pub-bg-fafbfd: #fafbfd;/, 'the light value of the page background is unchanged')
  assert.match(css, /--pub-bg-fafbfd: #0a1220;/)
  assert.match(read('styles/globals.css'), /@import '\.\/public-theme\.css'/)
  // The boot script is rendered by server pages, because React will not run a script a client component renders.
  assert.doesNotMatch(read('components/layout/public-theme-effect.tsx'), /<script/)
  for (const page of ['app/(auth)/sign-in/page.tsx', 'app/(auth)/verify-email/page.tsx', 'app/(auth)/accept-invitation/page.tsx']) assert.match(read(page), /PublicThemeScript/)
  for (const page of ['app/(auth)/forgot-password/page.tsx', 'app/(auth)/reset-password/page.tsx']) assert.doesNotMatch(read(page), /PublicTheme/, `${page} must stay light`)
})

test('the sign-in page reveals itself like the landing page, with a fallback for no JavaScript', () => {
  const auth = read('features/auth-ui/auth-screen.tsx')
  assert.match(auth, /lux-page/)
  assert.match(auth, /lux-reveal/)
  assert.match(auth, /lux-mask/)
  assert.match(auth, /<noscript>/)
})

test('the landing page has a light and dark button that keeps the choice for the rest of the app', () => {
  assert.match(read('features/marketing/components/landing-page.tsx'), /<PublicThemeToggle/)
  const toggle = read('components/layout/public-theme-toggle.tsx')
  assert.match(toggle, /THEME_KEY/)
  assert.match(toggle, /classList\.toggle\('dark'/)
})
