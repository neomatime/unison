import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const migrationName = readdirSync('supabase/migrations').find((name) => name.endsWith('_phase_five_data_portability_collaboration.sql'))
assert.ok(migrationName, 'Phase 5 migration is missing')
const migration = read(`supabase/migrations/${migrationName}`)
const formats = read('features/data-portability/file-formats.ts')
const importRoute = read('app/api/records/import/route.ts')
const exportRoute = read('app/api/records/export/route.ts')
const documents = read('features/delivery/components/project-documents-workspace.tsx')
const utilities = read('components/shared/utility-panel.tsx')
const realtime = read('components/layout/realtime-refresh.tsx')
const supportAction = read('features/collaboration/actions/create-support-ticket.ts')

test('Phase 5 collaboration tables are tenant isolated and explicitly exposed', () => {
  for (const table of ['documents', 'notifications', 'support_tickets', 'data_import_jobs', 'record_index', 'record_change_events']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /storage\.buckets/)
  assert.match(migration, /documents_objects_select/)
  assert.match(migration, /supabase_realtime add table public\.record_change_events/)
  assert.match(migration, /revoke all on[\s\S]+from anon/)
})

test('imports and exports use real tabular and document formats', () => {
  assert.match(formats, /ExcelJS\.Workbook/)
  assert.match(formats, /PDFDocument\.create/)
  assert.match(formats, /dangerousSpreadsheetPrefix/)
  assert.match(importRoute, /parseTabularFile/)
  assert.match(importRoute, /normalizeImportedRows/)
  assert.match(importRoute, /data_import_jobs/)
  assert.match(exportRoute, /buildCsv/)
  assert.match(exportRoute, /buildXlsx/)
  assert.match(exportRoute, /buildPdf/)
  assert.doesNotMatch(importRoute + exportRoute, /setTimeout|sessionStorage|moduleFixtures/)
})

test('documents, search, notifications and support are persistent', () => {
  assert.match(documents, /storage\.from\('documents'\)\.upload/)
  assert.match(documents, /from\('documents'\)\.insert/)
  assert.match(utilities, /fetch\('\/api\/notifications'/)
  assert.match(utilities, /fetch\(`\/api\/search/)
  assert.match(utilities, /postgres_changes/)
  assert.match(realtime, /record_change_events/)
  assert.match(supportAction, /from\('support_tickets'\)\.insert/)
  assert.doesNotMatch(utilities, /Invoice INV-1327|Northstar project/)
  assert.doesNotMatch(documents, /UAT execution evidence|malware-scan/)
})

test('global search is indexed, prefix-aware and tenant scoped', () => {
  assert.match(migration, /search_vector tsvector generated always/)
  assert.match(migration, /using gin\(search_vector\)/)
  assert.match(migration, /records\.organization_id = target_organization/)
  assert.match(migration, /quote_literal\(term\) \|\| ':\*'/)
  assert.match(migration, /security invoker/)
})
