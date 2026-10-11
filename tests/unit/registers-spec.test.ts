import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { REGISTERS, REGISTER_KINDS, isRegisterKind } from '../../features/registers/register-spec.ts'

const migrations = () => {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  return readdirSync(directory).filter((name) => name.endsWith('.sql')).sort().map((name) => readFileSync(join(directory, name), 'utf8')).join('\n')
}
const list = (raw: string) => raw.split(',').map((value) => value.trim().replace(/^'|'$/g, ''))

test('the five registers are the ones the spec names', () => {
  assert.deepEqual([...REGISTER_KINDS], ['lead', 'quote', 'opportunity', 'invoice', 'expense'])
  assert.equal(isRegisterKind('invoice'), true)
  assert.equal(isRegisterKind('forecast'), false)
  assert.equal(isRegisterKind(undefined), false)
})

test('every register names a table, search columns, a status column, an owner column, sortable columns and a default order', () => {
  for (const kind of REGISTER_KINDS) {
    const spec = REGISTERS[kind]
    assert.ok(spec.table && spec.collection && spec.searchColumns.length > 0 && spec.statusColumn && spec.ownerColumn, kind)
    assert.ok(Object.keys(spec.sortable).length >= 5, kind)
    assert.match(spec.defaultSort.column, /^[a-z_]+$/)
    assert.ok(['asc', 'desc'].includes(spec.defaultSort.dir))
    for (const column of [...spec.searchColumns, spec.statusColumn, spec.ownerColumn, ...Object.values(spec.sortable), spec.defaultSort.column]) {
      assert.match(column, /^[a-z_]+$/, `${kind}: ${column} is a plain column name`)
    }
  }
})

test('the status lists equal the database checks', () => {
  const sql = migrations()
  const check = (table: string, column: string) => {
    const block = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))
    assert.ok(block, `${table} table definition`)
    const match = block![1].match(new RegExp(`${column} text not null default '[^']*'\\s*check \\(${column} in \\(([^)]*)\\)\\)`))
    assert.ok(match, `${table}.${column} check`)
    return list(match![1])
  }
  assert.deepEqual([...REGISTERS.lead.statuses], check('leads', 'status'))
  assert.deepEqual([...REGISTERS.quote.statuses], check('quotes', 'status'))
  assert.deepEqual([...REGISTERS.opportunity.statuses], check('sales_opportunities', 'stage'))
  assert.deepEqual([...REGISTERS.invoice.statuses], check('invoices', 'status'))
  assert.deepEqual([...REGISTERS.expense.statuses], check('expenses', 'status'))
})
