import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { parseClientFeedQuery } from '../../lib/integrations/client-feed.ts'

const q = (s: string) => parseClientFeedQuery(new URLSearchParams(s))

test('defaults', () => {
  assert.deepEqual(q(''), { ok: true, updatedSince: null, cursor: null, limit: 100 })
})

test('accepts a valid window, cursor and limit', () => {
  const r = q('updated_since=2026-10-01T00:00:00Z&cursor=3f0d1e34-6024-4e1e-9eb7-988513913c16&limit=50')
  assert.deepEqual(r, {
    ok: true,
    updatedSince: '2026-10-01T00:00:00.000Z',
    cursor: '3f0d1e34-6024-4e1e-9eb7-988513913c16',
    limit: 50,
  })
})

test('rejects bad input', () => {
  assert.equal(q('updated_since=yesterday').ok, false)
  assert.equal(q('cursor=abc').ok, false)
  assert.equal(q('limit=0').ok, false)
  assert.equal(q('limit=501').ok, false)
  assert.equal(q('limit=1.5').ok, false)
})

test('only the client feed path is opened in the proxy, and the migration never grants the key table', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /['"]\/api\/v1\/clients['"]/)
  assert.doesNotMatch(proxy, /['"]\/api\/v1['"]/)
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261014100000_client_api_keys.sql'), 'utf8')
  assert.match(sql, /revoke all on public\.client_api_keys from anon, authenticated/)
  assert.match(sql, /grant execute on function public\.get_clients_for_api_key[^;]* to anon/)
})
