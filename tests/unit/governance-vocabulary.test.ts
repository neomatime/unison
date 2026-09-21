import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { APPROVAL_PRIORITIES, RISK_IMPACTS, RISK_PROBABILITIES, RISK_STATUSES } from '../../features/delivery/governance-vocabulary.ts'

// The form must not offer a value the database refuses. Read the check
// constraints out of the migration that created project_risks and compare.
const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260910130104_core_delivery_governance.sql'),
  'utf8',
)

function tableBlock(table: string): string {
  const block = migration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))
  assert.ok(block, `the ${table} table definition must be found in the migration`)
  return block![1]
}

function constraintValues(table: string, column: string): string[] {
  const match = tableBlock(table).match(new RegExp(`${column} text not null default '[^']*' check \\(${column} in \\(([^)]*)\\)\\)`))
  assert.ok(match, `the ${column} check constraint must be found`)
  return match![1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
}

test('risk probabilities match project_risks_probability_check', () => {
  assert.deepEqual([...RISK_PROBABILITIES], constraintValues('project_risks', 'probability'))
})

test('risk impacts match project_risks_impact_check', () => {
  assert.deepEqual([...RISK_IMPACTS], constraintValues('project_risks', 'impact'))
})

test('risk statuses match project_risks_status_check', () => {
  assert.deepEqual([...RISK_STATUSES], constraintValues('project_risks', 'status'))
})

test('approval priorities match approvals_priority_check', () => {
  assert.deepEqual([...APPROVAL_PRIORITIES], constraintValues('approvals', 'priority'))
})
