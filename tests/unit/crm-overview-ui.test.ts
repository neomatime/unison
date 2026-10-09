import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { OPEN_STAGES } from '../../features/crm-overview/types.ts'

const workspace = process.cwd()
const read = (...parts: string[]) => readFileSync(join(workspace, ...parts), 'utf8')
const feature = join('features', 'crm-overview')
const componentsDir = join(workspace, feature, 'components')
const componentFiles = readdirSync(componentsDir).filter((name) => /\.(tsx|ts)$/.test(name))
const component = (name: string) => readFileSync(join(componentsDir, name), 'utf8')
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)

const page = read('app', '(unison)', 'overview', 'page.tsx')
const query = read(feature, 'queries', 'get-crm-overview.ts')
const header = component('crm-overview-header.tsx')
const migration = read('supabase', 'migrations', '20261009100000_crm_overview.sql')
const coreMigration = read('supabase', 'migrations', '20260910175724_phase_six_commercial_finance.sql')

test('the Overview page renders the CRM dashboard from the CRM query, not the delivery briefing', () => {
  assert.match(page, /import \{ CrmOverviewScreen \} from ['"]@\/features\/crm-overview\/components\/crm-overview-screen['"]/)
  assert.match(page, /import \{ getCrmOverview \} from ['"]@\/features\/crm-overview\/queries\/get-crm-overview['"]/)
  assert.match(page, /await getCrmOverview\(\)/)
  assert.match(page, /<CrmOverviewScreen overview=\{overview\} \/>/)
  const sources = [...page.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
  assert.equal(sources.some((source) => /features\/delivery|features\/overview/.test(source)), false, 'the Overview must not import delivery or the retired fixture-backed overview')
  assert.equal(sources.some((source) => /(?:^|\/)(?:mocks|fixtures?)(?:\/|$)|(?:^|\/)data$/.test(source)), false, 'the Overview must not import fixture data')
})

test('no CRM overview code reaches into delivery, fixtures or the audit table', () => {
  for (const name of [...componentFiles.map((file) => join('components', file)), 'metrics.ts', 'normalize.ts', 'kpi-model.ts', 'types.ts', join('queries', 'get-crm-overview.ts')]) {
    const source = readFileSync(join(workspace, feature, name), 'utf8')
    for (const imported of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(!/features\/delivery|features\/overview|\/mocks?\/|fixtures?\//.test(imported[1]), `${name} imports ${imported[1]}`)
    }
    // audit_events is readable by owners and admins only: a feed built on it would
    // be empty for every member, with no sign that anything was withheld.
    assert.doesNotMatch(source, /audit_events/, `${name} must not read audit_events`)
  }
  assert.doesNotMatch(migration.replace(/--.*$/gm, ''), /audit_events/, 'the activity function must not read audit_events')
})

test('no figure is hard-coded into a component', () => {
  for (const file of componentFiles) {
    const source = component(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(source, /['"`>]\s*R\s?\d/, `${file} contains a literal rand amount`)
    assert.doesNotMatch(source, /\b(Horizon Finance|Molten Retail|Meridian Trust|Zentra Logistics)\b/, `${file} contains reference-image sample data`)
  }
})

test('the header carries the CRM copy and takes the greeting from the viewer clock', () => {
  assert.match(header, /Here&apos;s what matters across your client relationships today\./)
  assert.match(header, /Relationship priorities, pipeline performance, and commercial visibility in one place\./)
  assert.match(header, /const SEARCH_PLACEHOLDER = 'Search clients, leads, quotes, vendors\.\.\.'/)
  assert.match(header, /useShellContext\(\)/)
  assert.match(header, /<TenantSwitcher \/>/)
  assert.match(header, /greetingFor\(new Date\(\)\.getHours\(\)\)/)
  assert.doesNotMatch(header, /Good (morning|afternoon|evening)/, 'the greeting must be computed, never typed')
  assert.doesNotMatch(header, /\bNeo\b/)
  assert.doesNotMatch(header, /delivery|project/i, 'the header must carry no delivery wording')
})

test('anything reading the viewer clock is client-only and renders empty on the server', () => {
  const clock = component('use-clock.ts')
  assert.ok(isClient(clock))
  assert.match(clock, /useSyncExternalStore\(subscribeToMinute, read, \(\) => ''\)/, 'the server snapshot must be empty so hydration cannot mismatch')
  for (const file of componentFiles) {
    const source = component(file)
    if (/from ['"]\.\/use-clock['"]/.test(source)) assert.ok(isClient(source), `${file} uses the clock hook and must be a client module`)
  }
})

test('the server/client boundary holds: no function from a client module is called on the server', () => {
  // The Integrations slice once shipped a page that threw on every request because
  // a Server Component CALLED a function exported from a 'use client' module. It
  // compiled, type-checked and built; only a render caught it. These pin the cases
  // that could recur here.
  const server = ['panel.tsx', 'kpi-cards.tsx', 'sales-pipeline.tsx', 'recent-activity.tsx', 'my-tasks.tsx', 'crm-overview-screen.tsx']
  for (const file of server) {
    const source = component(file)
    assert.ok(!isClient(source), `${file} is a server component`)
    assert.doesNotMatch(source, /useClockValue\(|useState\(|useEffect\(|useRouter\(|useMemo\(/, `${file} must not call a hook`)
  }
  const client = ['crm-overview-header.tsx', 'revenue-overview.tsx', 'local-time.tsx', 'refresh-button.tsx', 'use-clock.ts']
  for (const file of client) assert.ok(isClient(component(file)), `${file} uses hooks and must be a client module`)

  // Shared by both sides, so it must carry no directive at all.
  for (const shared of ['metrics.ts', 'normalize.ts', 'kpi-model.ts', 'types.ts']) {
    assert.ok(!isClient(readFileSync(join(workspace, feature, shared), 'utf8')), `${shared} is imported by server and client code and must not be a client module`)
  }
  // Icons are functions. A server file may hand one to a component declared in that
  // same file, but never to anything imported, which could be a client component.
  for (const file of server) {
    const source = component(file)
    for (const match of source.matchAll(/<([A-Z]\w*)\b[^>]*\bicon=\{/g)) {
      assert.match(source, new RegExp(`function ${match[1]}\\b`), `${file} passes an icon component to <${match[1]}>, which is not declared in the same file`)
    }
  }
})

test('the query is server-only, isolates each section, and never swallows a failure into a value', () => {
  assert.match(query, /^import 'server-only'/)
  assert.match(query, /async function section<T>/)
  assert.match(query, /return \{ status: 'error' \}/)
  assert.doesNotMatch(query, /\?\? 0\b|\|\| 0\b/, 'a failed read must not fall back to zero')
  for (const name of ['kpis', 'pipeline', 'revenue', 'activity', 'tasks']) {
    assert.match(query, new RegExp(`section\\('${name}'`), `${name} must load through section()`)
  }
  assert.match(query, /Promise\.all\(\[/)
  assert.match(query, /await entitledModuleIds\(\)/, 'the tenant plan must reach the queries')
  assert.match(query, /\.eq\('organization_id', organizationId\)/, 'the tasks read must be organisation-scoped')
  assert.match(query, /export const REPORTING_TIME_ZONE = 'Africa\/Johannesburg'/)
})

test('every function the query calls exists in the migration with the arguments it passes', () => {
  for (const name of ['crm_overview_kpis', 'crm_overview_pipeline', 'crm_overview_revenue', 'crm_overview_activity']) {
    assert.match(query, new RegExp(`'${name}'`), `${name} is not called`)
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`), `${name} is missing from the migration`)
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(.*\\) to authenticated;`), `${name} must be callable by signed-in users`)
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(.*\\) from public, anon;`), `${name} must not be callable by anon`)
  }
  for (const argument of ['p_organization_id', 'p_modules', 'p_timezone', 'p_limit']) {
    assert.match(query, new RegExp(argument))
    assert.match(migration, new RegExp(argument))
  }
})

test('the functions run as the caller, refuse non-members, and are read-only', () => {
  const code = migration.replace(/--.*$/gm, '')
  const functions = code.split(/create or replace function public\.crm_overview_/).slice(1)
  assert.equal(functions.length, 4)
  for (const body of functions) {
    assert.match(body, /security invoker/)
    assert.match(body, /stable/)
    assert.match(body, /not public\.is_member_of\(p_organization_id\)/)
    assert.match(body, /errcode = '42501'/)
    assert.doesNotMatch(body, /\b(insert into|update public|delete from)\b/, 'a dashboard read must not write')
    assert.doesNotMatch(body, /security definer/)
  }
})

test('the pipeline stages match the sales_opportunities stage check', () => {
  const block = coreMigration.match(/create table public\.sales_opportunities \(([\s\S]*?)\n\);/)
  assert.ok(block)
  const match = block![1].match(/stage text not null default '[^']*'\s*check \(stage in \(([^)]*)\)\)/)
  assert.ok(match, 'the stage check constraint must be found')
  const stages = match![1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
  assert.deepEqual([...OPEN_STAGES, 'Won', 'Lost'], stages, 'open stages plus Won and Lost must be every stage the database allows, in order')
  const listed = [...migration.matchAll(/\(\d, '([A-Za-z]+)'\)/g)].map((entry) => entry[1])
  assert.deepEqual(listed, [...OPEN_STAGES], 'the SQL stage list must match OPEN_STAGES')
})

test('the lead and quote definitions only use statuses the database allows, and exclude the closed ones', () => {
  const allowed = (table: string, column: string) => {
    const block = coreMigration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))!
    const match = block[1].match(new RegExp(`${column} text not null default '[^']*'\\s*check \\(${column} in \\(([^)]*)\\)\\)`))!
    return match[1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
  }
  const used = (pattern: RegExp) => {
    const found = migration.match(pattern)
    assert.ok(found, `${pattern} must be in the migration`)
    return found![1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
  }
  const leadStatuses = allowed('leads', 'status')
  const openLeads = used(/archived_at is null and status in \(([^)]*)\)\),\s*'created_this_month'/)
  assert.deepEqual(openLeads, ['New', 'Contacted', 'Qualified'])
  for (const status of openLeads) assert.ok(leadStatuses.includes(status), `lead status ${status} is not allowed by the table`)
  for (const closed of ['Converted', 'Disqualified']) assert.ok(!openLeads.includes(closed), `${closed} is a closed lead`)

  const quoteStatuses = allowed('quotes', 'status')
  const activeQuotes = used(/'active', count\(\*\) filter \(where archived_at is null and status in \(([^)]*)\)\)/)
  assert.deepEqual(activeQuotes, ['Draft', 'Internal Review', 'Sent'])
  for (const status of activeQuotes) assert.ok(quoteStatuses.includes(status), `quote status ${status} is not allowed by the table`)
  for (const resolved of ['Accepted', 'Declined', 'Expired']) assert.ok(!activeQuotes.includes(resolved), `${resolved} is a resolved quote`)
})

test('revenue is sales booked by won_at, per currency, and never an invoice or cash figure', () => {
  const code = migration.replace(/--.*$/gm, '')
  const kpis = code.slice(code.indexOf('crm_overview_kpis'), code.indexOf('crm_overview_pipeline'))
  assert.match(kpis, /stage = 'Won'/)
  assert.match(kpis, /won_at >= year_start/)
  assert.match(kpis, /group by currency/, 'amounts must be grouped by currency, never summed across them')
  assert.doesNotMatch(kpis, /public\.invoices|balance_amount|paid_at/, 'revenue must not be read from invoices or payments')
})

test('the milestone timestamps are protected by triggers, not by a convention in one action', () => {
  const code = migration.replace(/--.*$/gm, '')
  assert.match(code, /create trigger sales_opportunities_keep_won_at\s+before insert or update on public\.sales_opportunities/)
  assert.match(code, /create trigger quotes_keep_milestones\s+before insert or update on public\.quotes/)
  assert.match(code, /new\.won_at := old\.won_at/, 'an edit of a won deal must not re-date the win')
})
