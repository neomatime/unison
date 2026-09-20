import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'

// An unauthenticated caller must be refused at the privilege layer, not merely
// filtered by row-level security. Supabase's default privileges grant the anon
// role full DML on every new public table, and this schema's convention is to
// `revoke all ... from anon` on each one. Five older tables predate that
// convention and kept the default; RLS and the is_member_of() execute-revoke
// stopped it being exploitable, but it left anon one policy mistake away from
// reading or writing tenant data, and it leaves TRUNCATE (which ignores RLS)
// granted. Asserting on the message rather than only the code is deliberate:
// an RLS refusal is also SQLSTATE 42501, and a policy that calls is_member_of()
// makes anon fail with "permission denied for FUNCTION is_member_of" before the
// table is ever considered. Only "permission denied for TABLE <name>" proves the
// table privilege itself is gone.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

/** A client with no session at all. */
const anonymous = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'

const TABLES = [
  // The five that predate the convention.
  'frameworks',
  'framework_phases',
  'projects',
  'delivery_items',
  'project_dependencies',
  // Already following it: pinned so the convention cannot quietly regress.
  'requirements',
  'requirement_delivery_items',
  'requirement_evidence',
] as const

for (const table of TABLES) {
  const denied = new RegExp(`permission denied for table ${table}\\b`)

  test(`anon has no privileges on ${table}`, async () => {
    const read = await anonymous.from(table).select('id').limit(1)
    assert.ok(read.error, `anon must not be able to read ${table}, not merely see zero rows`)
    assert.match(read.error!.message, denied, `select on ${table}`)

    const write = await anonymous.from(table).insert({ organization_id: NIL })
    assert.ok(write.error, `anon must not be able to insert into ${table}`)
    assert.match(write.error!.message, denied, `insert on ${table}`)

    const update = await anonymous.from(table).update({ organization_id: NIL }).eq('id', NIL)
    assert.ok(update.error, `anon must not be able to update ${table}`)
    assert.match(update.error!.message, denied, `update on ${table}`)

    const remove = await anonymous.from(table).delete().eq('id', NIL)
    assert.ok(remove.error, `anon must not be able to delete from ${table}`)
    assert.match(remove.error!.message, denied, `delete on ${table}`)
  })
}
