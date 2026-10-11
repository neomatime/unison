import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const registers = (...parts: string[]) => read('features', 'registers', ...parts)

test('the query layer reads one page for one organisation, through the register rules, and fails loudly', () => {
  const source = registers('queries', 'query-register.ts')
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /applyRegisterFilters\(/)
  assert.match(source, /applyRegisterOrder\(/)
  assert.match(source, /count: 'exact'/)
  assert.match(source, /\.range\(/)
  assert.match(source, /pageWindow\(/)
  assert.match(source, /if \(\w+\.error\) throw/)
  assert.doesNotMatch(source, /select\('\*'\)(?!, \{)/, 'no unbounded select')
})

test('the summary and the owner list are server-only and fail loudly', () => {
  for (const name of ['get-register-summary.ts', 'list-owners.ts']) {
    const source = registers('queries', name)
    assert.match(source, /^import 'server-only'/, name)
    assert.match(source, /if \(\w+\.error\) throw/, name)
  }
  assert.match(registers('queries', 'get-register-summary.ts'), /rpc\('register_summary'/)
  assert.match(registers('queries', 'list-owners.ts'), /\.eq\('organization_id', organization\.id\)/)
})

test('the archive actions check the kind and the id first, write only archived_at, and scope by organisation', () => {
  const source = registers('actions', 'archive.ts')
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (/^export /.test(line)) assert.match(line, /^export (async function|type) /, line)
  }
  const kind = source.indexOf('isRegisterKind(')
  const id = source.indexOf('isUuid(')
  const write = source.indexOf('.update(')
  assert.ok(kind > -1 && id > -1 && write > id && write > kind, 'the kind and id are checked before any write')
  assert.match(source, /\.update\(\{ archived_at:/)
  assert.doesNotMatch(source, /\.update\(\{(?![^}]*archived_at)/, 'nothing but archived_at is written')
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /This record is already archived\./)
  assert.match(source, /This record is not archived\./)
})

test('the single-record read no longer loads a whole table', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  const start = queries.indexOf('export async function getPhaseSixRecord')
  assert.ok(start > -1)
  const body = queries.slice(start)
  assert.match(body, /\.eq\('id', id\)|\.eq\("id", id\)/, 'one row by id')
  assert.match(body, /maybeSingle\(\)/)
  assert.ok(body.split('.find(').length - 1 <= 1, 'no find over a loaded list for the five registers (only the unreachable forecast path may keep one)')
  assert.match(body, /kind === ['"]forecast['"][^\n]*\.find\(/, 'the one remaining find is the forecast path')
  assert.match(registers('queries', 'query-register.ts'), /PGRST103/, 'a page past the end is handled')
})
