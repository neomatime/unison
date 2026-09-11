import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const route = readFileSync(
  join(workspace, 'app', 'api', 'integrations', 'webhook', '[connectionId]', 'route.ts'),
  'utf8',
)
const proxy = readFileSync(join(workspace, 'proxy.ts'), 'utf8')

test('the public proxy exemption is limited to the integration webhook route family', () => {
  assert.match(proxy, /['"]\/api\/integrations\/webhook['"]/, 'the webhook route must pass the browser-session proxy')
  assert.doesNotMatch(proxy, /AUTH_EXEMPT\s*=\s*\[[\s\S]*?['"]\/api['"]/, 'the whole API surface must not bypass sign-in')
  assert.doesNotMatch(proxy, /AUTH_EXEMPT\s*=\s*\[[\s\S]*?['"]\/api\/integrations['"]/, 'unrelated integration APIs must remain protected')

  const exemptBlock = proxy.match(/const AUTH_EXEMPT\s*=\s*\[([\s\S]*?)\]/)?.[1]
  assert.ok(exemptBlock, 'AUTH_EXEMPT must remain an inspectable literal list')
  const entries = [...exemptBlock.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
  const matchesPath = (path: string, entry: string) => path === entry || path.startsWith(`${entry}/`)
  const isExempt = (path: string) => entries.some((entry) => matchesPath(path, entry))

  assert.equal(isExempt('/api/integrations/webhook/3f0d1e34-6024-4e1e-9eb7-988513913c16'), true)
  assert.equal(isExempt('/api/integrations/webhooks/3f0d1e34-6024-4e1e-9eb7-988513913c16'), false)
  assert.equal(isExempt('/api/integrations/connections'), false)
  assert.equal(isExempt('/api/integrations-webhook/3f0d1e34-6024-4e1e-9eb7-988513913c16'), false)
})

test('the webhook uses the public Supabase client and delegates credentials to one RPC', () => {
  assert.match(route, /readSupabasePublicEnv\(process\.env\)/)
  assert.match(route, /SUPABASE_PUBLISHABLE_KEY/)
  assert.match(route, /rpc\('ingest_integration_event'/)
  assert.doesNotMatch(route, /createAdminSupabase|SUPABASE_SECRET_KEY|service_role/i)
  for (const parameter of ['p_connection_id', 'p_secret', 'p_event_key', 'p_external_id', 'p_payload']) {
    assert.ok(route.includes(parameter), `${parameter} must be sent to the ingestion RPC`)
  }
})

test('the webhook rejects oversized or non-JSON input before ingestion', () => {
  assert.match(route, /export const runtime = ['"]nodejs['"]/)
  assert.match(route, /const MAX_BODY_BYTES = 64 \* 1024/)
  assert.match(route, /content-type/)
  assert.match(route, /application\/json/)
  assert.match(route, /readLimitedBody\(request\)/)
  assert.match(route, /JSON\.parse\(rawBody\)/)
})

test('credential failures are uniform and successful ingestion is asynchronous', () => {
  assert.match(route, /Webhook credentials were not accepted\./)
  assert.match(route, /status: 401/)
  assert.match(route, /eventId: result\.event_id, runIds: result\.run_ids \?\? \[\]/)
  assert.match(route, /status: 202/)
  assert.doesNotMatch(route, /error\?\.message|error\.message/)
})
