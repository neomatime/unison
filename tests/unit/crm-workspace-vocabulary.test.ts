import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  FOLLOW_UP_PRIORITIES,
  LOGGED_ACTIVITY_KINDS,
  OPPORTUNITY_STAGES,
  SYSTEM_ACTIVITY_KINDS,
} from '../../features/crm-workspace/vocabulary.ts'

const migration = (name: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
const list = (raw: string) => raw.split(',').map((value) => value.trim().replace(/^'|'$/g, ''))

test('the activity kinds in the code are exactly the ones the database allows', () => {
  const sql = migration('20261010100000_crm_contacts_activities.sql')
  const match = sql.match(/kind text not null constraint activities_kind_check check \(kind in \(([^)]*)\)\)/)
  assert.ok(match, 'the activities kind check must be found')
  assert.deepEqual([...LOGGED_ACTIVITY_KINDS, ...SYSTEM_ACTIVITY_KINDS], list(match![1]))
})

test('the logged kinds are the ones the insert policy allows, so the form cannot offer a refused kind', () => {
  const sql = migration('20261010100000_crm_contacts_activities.sql')
  const policy = sql.match(/create policy activities_insert[\s\S]*?kind in \(([^)]*)\)/)
  assert.ok(policy)
  assert.deepEqual([...LOGGED_ACTIVITY_KINDS], list(policy![1]))
})

test('the stages match the sales_opportunities stage check', () => {
  const sql = migration('20260910175724_phase_six_commercial_finance.sql')
  const block = sql.match(/create table public\.sales_opportunities \(([\s\S]*?)\n\);/)
  assert.ok(block)
  const match = block![1].match(/stage text not null default '[^']*'\s*check \(stage in \(([^)]*)\)\)/)
  assert.ok(match)
  assert.deepEqual([...OPPORTUNITY_STAGES], list(match![1]))
})

test('the follow-up priorities match the tasks priority check', () => {
  const sql = migration('20260910171605_phase_four_team_operational_delivery.sql')
  const block = sql.match(/create table public\.tasks \(([\s\S]*?)\n\);/)
  assert.ok(block)
  const match = block![1].match(/priority text not null default '[^']*' check \(priority in \(([^)]*)\)\)/)
  assert.ok(match)
  assert.deepEqual([...FOLLOW_UP_PRIORITIES], list(match![1]))
})
