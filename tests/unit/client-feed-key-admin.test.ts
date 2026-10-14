import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261014140000_client_feed_key_admin.sql'), 'utf8')
const actions = readFileSync(join(process.cwd(), 'features/platform-automation/client-feed-actions.ts'), 'utf8')

test('every key admin function checks owner/admin and is closed to anon', () => {
  for (const fn of ['create_client_feed_key', 'list_client_feed_keys', 'revoke_client_feed_key']) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`))
  }
  assert.equal((sql.match(/has_role\([^)]*array\['owner', 'admin'\]\)/g) ?? []).length, 3)
})

test('the key hash is never returned by the list function', () => {
  const list = sql.slice(sql.indexOf('list_client_feed_keys'), sql.indexOf('revoke_client_feed_key'))
  assert.doesNotMatch(list, /key_hash/)
})

test('actions require an administrator before touching the database', () => {
  assert.match(actions, /requireAdministrator\(\)/g)
  assert.ok(actions.indexOf('requireAdministrator()') < actions.indexOf('createServerSupabase()'))
})
