import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'

// Source-reading tests for the quote portal's plumbing: the public-route exemption, the response headers, the build
// tracing key, the service-role module and the analytics redaction. The portal client and the server action cannot be
// loaded by node --test (server-only, the @/ alias, a directive), so they are guarded by what their source says.

const workspace = process.cwd()
const read = (...parts: string[]) => readFileSync(join(workspace, ...parts), 'utf8').replace(/\r\n/g, '\n')
const proxy = read('proxy.ts')
const nextConfigSource = read('next.config.mjs')

type HeaderRule = { source: string; headers: { key: string; value: string }[] }
/** The real configuration object, as Next reads it. Its JSDoc type makes every function optional; this file defines all of them. */
async function loadNextConfig() {
  const { default: config } = await import('../../next.config.mjs')
  return config as unknown as {
    headers: () => Promise<HeaderRule[]>
    redirects: () => Promise<unknown[]>
    outputFileTracingIncludes: Record<string, string[]>
  }
}

// 43 base64url characters: the shape of a real link token. Not a real token.
const TOKEN = 'A'.repeat(20) + '-_' + 'b'.repeat(21)

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}
const repoPath = (file: string) => relative(workspace, file).split(sep).join('/')
function applicationFiles(): string[] {
  const roots = ['features', 'lib', 'app', 'components', 'config', 'types', 'hooks']
  const rootFiles = readdirSync(workspace)
    .map((entry) => join(workspace, entry))
    .filter((full) => !statSync(full).isDirectory() && (full.endsWith('.ts') || full.endsWith('.tsx')))
  return [...roots.flatMap((root) => walk(join(workspace, root))), ...rootFiles]
}

// ---- the proxy ----
test('/q is exempt from sign-in with a segment boundary', () => {
  const exemptBlock = proxy.match(/const AUTH_EXEMPT\s*=\s*\[([\s\S]*?)\]/)?.[1]
  assert.ok(exemptBlock, 'AUTH_EXEMPT must remain an inspectable literal list')
  const entries = [...exemptBlock.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
  const matchesPath = (path: string, entry: string) => path === entry || path.startsWith(`${entry}/`)
  const isExempt = (path: string) => entries.some((entry) => matchesPath(path, entry))
  // The copy above stands for the one in proxy.ts. Pin that one's text, so loosening it to a plain startsWith (which
  // would exempt /quotes, /qq/x and every other path that merely begins with the letter) cannot pass unnoticed.
  assert.match(proxy, /function matchesPath\(path: string, entry: string\): boolean \{\s*return path === entry \|\| path\.startsWith\(`\$\{entry\}\/`\)\s*\}/)
  assert.match(proxy, /AUTH_EXEMPT\.some\(\(p\) => matchesPath\(path, p\)\)/)

  assert.ok(entries.includes('/q'), 'the portal prefix must be listed')
  assert.equal(isExempt('/q'), true)
  assert.equal(isExempt('/q/abc'), true)
  assert.equal(isExempt(`/q/${TOKEN}`), true)
  assert.equal(isExempt(`/q/${TOKEN}/pdf`), true)
  assert.equal(isExempt('/quotes'), false)
  assert.equal(isExempt('/qq/x'), false)
  assert.equal(isExempt('/q-debug'), false)
  assert.equal(isExempt('/commercial/quotes/1'), false)
  assert.equal(isExempt('/api/q'), false)
  assert.equal(isExempt('/api/q/abc'), false)

  // No API prefix was opened to make the portal reachable: the API entries are exactly the three that had their own credential.
  assert.deepEqual(
    entries.filter((entry) => entry.startsWith('/api')),
    ['/api/integrations/webhook', '/api/integrations/website-leads', '/api/v1/clients'],
  )
  assert.ok(!entries.includes('/api'), 'the whole API surface must not bypass sign-in')
  assert.ok(!entries.includes('/'), 'the root must not be an exemption prefix, or every path would match')
})

test('a portal path reaches the proxy, so the exemption is what lets it through', () => {
  // The matcher is a negative lookahead that only leaves out static assets and images. If it ever excluded /q, the
  // portal would bypass the proxy altogether and this test would say the exemption is no longer the gate.
  const literal = proxy.match(/matcher:\s*\[\s*'([^']+)'\s*\]/)?.[1]
  assert.ok(literal, 'the proxy matcher must remain one inspectable pattern')
  const matcher = new RegExp(`^${literal.replace(/\\\\/g, '\\')}$`)
  assert.equal(matcher.test('/q'), true)
  assert.equal(matcher.test(`/q/${TOKEN}`), true)
  assert.equal(matcher.test(`/q/${TOKEN}/pdf`), true)
  assert.equal(matcher.test('/_next/static/chunks/main.js'), false, 'the matcher still leaves static assets alone')
})

// ---- the build configuration ----
test('portal responses carry the four headers', async () => {
  assert.match(nextConfigSource, /async headers\(\)/)
  assert.match(nextConfigSource, /source:\s*'\/q\/:path\*'/)

  const config = await loadNextConfig()
  const rules = await config.headers()
  const portal = rules.filter((rule) => rule.source === '/q/:path*')
  assert.equal(portal.length, 1, 'one rule for the portal prefix')
  const sent = Object.fromEntries(portal[0].headers.map((header) => [header.key, header.value]))
  assert.deepEqual(sent, {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "frame-ancestors 'none'",
  })

  // The rest of the application is neither kept out of search indexes nor made uncacheable by these headers.
  for (const rule of rules) {
    if (rule.source === '/q/:path*') continue
    const keys = rule.headers.map((header) => header.key.toLowerCase())
    assert.ok(!keys.includes('x-robots-tag') && !keys.includes('cache-control'), `${rule.source} must not carry portal headers`)
  }

  // The existing sign-up redirect is untouched.
  assert.deepEqual(await config.redirects(), [{ source: '/sign-up', destination: '/sign-in', permanent: false }])
})

test('the pdf route is traced with the brand images', async () => {
  // The key is a glob over the route path, so the brackets of the dynamic segment are escaped: two backslashes in the file.
  assert.ok(nextConfigSource.includes("'/q/\\\\[token\\\\]/pdf': ['./public/brand/**/*']"), 'the portal pdf route lists the brand images')
  const tracing = (await loadNextConfig()).outputFileTracingIncludes
  assert.deepEqual(tracing['/q/\\[token\\]/pdf'], ['./public/brand/**/*'])
  for (const key of [
    '/commercial/quotes/\\[quoteId\\]',
    '/commercial/quotes/\\[quoteId\\]/document/pdf',
    '/finance/invoices/\\[invoiceId\\]',
    '/finance/invoices/\\[invoiceId\\]/document/pdf',
  ]) {
    assert.deepEqual(tracing[key], ['./public/brand/**/*'], `${key} keeps its entry`)
  }
})

// ---- the service-role module ----
test('the portal client is the only new service-role importer and is server-only', () => {
  const source = read('lib', 'quote-portal', 'portal-client.ts')
  assert.ok(source.startsWith("import 'server-only'"), 'server-only is the first line')
  assert.match(source, /from '@\/lib\/supabase\/admin'/)
  assert.match(source, /createAdminSupabase\(\)/)

  const importers = applicationFiles()
    .filter((file) => /from ['"](@\/lib\/supabase\/admin|.*\/lib\/supabase\/admin)['"]/.test(readFileSync(file, 'utf8')))
    .map(repoPath)
  const portalImporters = importers.filter((file) => file.includes('quote-portal') || file.startsWith('app/q/') || file.includes('analytics'))
  assert.deepEqual(portalImporters, ['lib/quote-portal/portal-client.ts'])

  // Everything else the portal adds reaches the database only through that module.
  for (const parts of [
    ['features', 'quote-portal', 'actions', 'record-view.ts'],
    ['components', 'shared', 'analytics-url.ts'],
    ['components', 'shared', 'safe-analytics.tsx'],
  ]) {
    assert.doesNotMatch(read(...parts), /supabase\/admin|createAdminSupabase/, parts.join('/'))
  }
})

const portalClientSource = () => read('lib', 'quote-portal', 'portal-client.ts')
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > -1, `${name} is exported`)
  const next = source.indexOf('export async function', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

test('the portal client checks the token shape before it reads the environment or calls the database', () => {
  const portalClient = portalClientSource()
  assert.equal((portalClient.match(/\.rpc\(/g) ?? []).length, 2, 'exactly two database calls')
  for (const [name, rpc] of [['getPortalQuote', 'portal_get_quote'], ['recordPortalView', 'portal_record_view']]) {
    const body = bodyOf(portalClient, name)
    const guard = body.indexOf('isPortalToken(')
    assert.ok(guard > -1, `${name} checks isPortalToken`)
    assert.ok(body.indexOf('createAdminSupabase(') > guard, `${name} builds the client only after the check`)
    assert.ok(body.indexOf('.rpc(') > guard, `${name} calls the database only after the check`)
    assert.ok(body.includes(`.rpc('${rpc}', { p_token: token })`), `${name} calls ${rpc} with the token`)
  }
  assert.match(bodyOf(portalClient, 'getPortalQuote'), /return \{ state: 'invalid' \}/, 'a malformed token is the invalid answer')
})

test('the portal client rejects an answer that is not one of the six states', () => {
  const portalClient = portalClientSource()
  const body = bodyOf(portalClient, 'getPortalQuote')
  assert.match(portalClient, /PORTAL_STATES/)
  assert.match(body, /throw new Error\(/)
  assert.match(body, /if \(error\)/)
})

test('the token never reaches an error message or a log line', () => {
  const portalClient = portalClientSource()
  // Database errors are reduced to their code: a message, detail or hint could quote the parameter it failed on.
  assert.doesNotMatch(portalClient, /\.(message|details|hint)\b/)
  assert.doesNotMatch(portalClient, /console\./)
  assert.doesNotMatch(portalClient, /cause\s*:/)
  const recordView = read('features', 'quote-portal', 'actions', 'record-view.ts')
  // Stronger than looking at the Error and console lines: once comments, imports and the three places the token is
  // meant to go are taken out, the word does not appear in the code at all. It is a parameter, it is checked by
  // isPortalToken, it is handed on to the database, and nothing else can reach it to put in a message.
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  for (const [name, source] of [['portal-client.ts', portalClient], ['record-view.ts', recordView]]) {
    const residue = withoutComments(source)
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n')
      .replace(/\(token: string\)/g, '')
      .replace(/isPortalToken\(token\)/g, '')
      .replace(/recordPortalView\(token\)/g, '')
      .replace(/\{ p_token: token \}/g, '')
    assert.doesNotMatch(residue, /\btoken\b|\bp_token\b/i, `${name}: the token is used only to check it and to hand it on`)
  }
  // The one log line carries a tag and the message of an error this module built.
  assert.equal((recordView.match(/console\./g) ?? []).length, 1)
})

// ---- the server action ----
test('recordViewAction swallows errors with a token-free log', () => {
  const source = read('features', 'quote-portal', 'actions', 'record-view.ts')
  assert.match(source, /^\s*(\/\/[^\n]*\n\s*)*'use server'/, 'the directive comes first')
  const exported = [...source.matchAll(/^export\s+(.*)$/gm)].map((match) => match[1])
  assert.ok(exported.length > 0 && exported.every((statement) => statement.startsWith('async function ')), 'a use-server file exports only async functions')
  assert.match(source, /from '@\/lib\/quote-portal\/portal-client'/)

  const body = bodyOf(source, 'recordViewAction')
  const tried = body.indexOf('try {')
  const call = body.indexOf('await recordPortalView(token)')
  const caught = body.indexOf('catch')
  assert.ok(tried > -1 && call > tried && caught > call, 'the call sits inside a try with a catch')
  assert.doesNotMatch(body.slice(caught), /throw\b/, 'the catch never rethrows')
  const logs = body.match(/console\.error\(.*\)/g) ?? []
  assert.equal(logs.length, 1, 'one log line')
  assert.ok(logs[0].startsWith("console.error('[quote-portal:view]'"), 'tagged, as the brief names it')
  assert.doesNotMatch(logs[0], /\btoken\b/i, 'the token is not in the log line')
})

// ---- analytics ----
test('the root layout uses SafeAnalytics, not Analytics directly', () => {
  const layout = read('app', 'layout.tsx')
  assert.match(layout, /import \{ SafeAnalytics \} from '@\/components\/shared\/safe-analytics'/)
  assert.match(layout, /<SafeAnalytics \/>/)
  assert.doesNotMatch(layout, /@vercel\/analytics/)
  assert.doesNotMatch(layout, /<Analytics\b/)

  const wrapper = read('components', 'shared', 'safe-analytics.tsx')
  assert.match(wrapper, /^\s*'use client'/, 'a function prop cannot cross from a server component, so the wrapper is a client component')
  assert.match(wrapper, /from '@vercel\/analytics\/next'/)
  assert.match(wrapper, /<Analytics beforeSend=\{redactPortalUrl\} \/>/)

  // The wrapper is the one place the package is imported, so no page can add a second, unredacted Analytics.
  const importers = applicationFiles()
    .filter((file) => /from ['"]@vercel\/analytics/.test(readFileSync(file, 'utf8')))
    .map(repoPath)
  assert.deepEqual(importers, ['components/shared/safe-analytics.tsx'])
})

test('redactPortalUrl replaces the whole portal address and nothing else', async () => {
  const { redactPortalUrl } = await import('../../components/shared/analytics-url.ts')

  // The token, the query and the hash all go.
  assert.deepEqual(redactPortalUrl({ type: 'pageview', url: `https://host/q/${TOKEN}?x=1#h` }), { type: 'pageview', url: 'https://host/q/redacted' })
  assert.equal(redactPortalUrl({ url: `https://host.example:3000/q/${TOKEN}` }).url, 'https://host.example:3000/q/redacted')
  assert.equal(redactPortalUrl({ url: `https://host/q/${TOKEN}/pdf?download=1` }).url, 'https://host/q/redacted')
  assert.equal(redactPortalUrl({ url: 'https://host/q' }).url, 'https://host/q/redacted')
  assert.equal(redactPortalUrl({ url: 'https://host/q/' }).url, 'https://host/q/redacted')
  assert.equal(redactPortalUrl({ url: `https://host/q?t=${TOKEN}` }).url, 'https://host/q/redacted')
  assert.equal(redactPortalUrl({ url: `http://localhost:3000/q/${TOKEN}#${TOKEN}` }).url, 'http://localhost:3000/q/redacted')

  // The rest of the application keeps its address, query and hash.
  for (const url of [
    'https://host/commercial/quotes/abc',
    'https://host/commercial/quotes/abc?tab=lines#totals',
    'https://host/quotes',
    'https://host/qq/x',
    'https://host/quotes/q/abc',
    'https://host/api/q/abc',
    'https://host/',
  ]) {
    const event = { type: 'pageview' as const, url }
    assert.equal(redactPortalUrl(event), event, `${url} is returned as it came`)
    assert.equal(redactPortalUrl(event).url, url)
  }

  // Other fields of the event survive, and the input is not changed.
  const event = { type: 'event' as const, url: `https://host/q/${TOKEN}` }
  assert.deepEqual(redactPortalUrl(event), { type: 'event', url: 'https://host/q/redacted' })
  assert.equal(event.url, `https://host/q/${TOKEN}`)
})

test('redactPortalUrl never throws on a string that is not an absolute URL', async () => {
  const { redactPortalUrl } = await import('../../components/shared/analytics-url.ts')
  for (const url of ['', 'not a url', 'http://', '://x', 'https://[', '%%%']) {
    const event = { url }
    assert.doesNotThrow(() => redactPortalUrl(event), url)
    assert.equal(redactPortalUrl(event), event, `${JSON.stringify(url)} is returned as it came`)
  }
  // A relative portal address carries the same token, so it is redacted too rather than passed on because it cannot be parsed.
  assert.equal(redactPortalUrl({ url: `/q/${TOKEN}?x=1#h` }).url, '/q/redacted')
  assert.equal(redactPortalUrl({ url: '/q' }).url, '/q/redacted')
  assert.equal(redactPortalUrl({ url: '/quotes/1' }).url, '/quotes/1')
  assert.equal(redactPortalUrl({ url: '/qq/x' }).url, '/qq/x')
  // Not a string at all (the type forbids it, a script could send it): returned as it came.
  const odd = { url: undefined as unknown as string }
  assert.doesNotThrow(() => redactPortalUrl(odd))
  assert.equal(redactPortalUrl(odd), odd)
})
