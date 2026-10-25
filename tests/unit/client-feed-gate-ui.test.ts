import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { beforeEach, mock } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { installComponentLoader } from './support/component-loader.ts'

// Quote portal, slice 3, task 3: the owner/admin switch for the HIVE feed gate on Settings > Integrations, and the
// preview of what turning it on does.
//
// The server action and the query are run for real here against a recording fake of the signed-in client (the session,
// next/cache and the Supabase client are stubbed through tests/unit/support/component-loader.ts), so what is asserted
// about who may switch, the single database call, the sentences and the revalidation is behaviour, not text. The
// component is rendered to static markup with react-dom/server, so what is asserted about checkboxes, labels and ARIA is
// the real markup. What a render cannot show (a click, the transition, the text a finished action leaves behind) and
// what only the database can show (the policy on organization_settings, the status function itself) are guarded by the
// source here and by the slice 3 database tests. Nothing in this file touches a database.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const actionSource = () => read('features', 'platform-automation', 'client-feed-actions.ts')
const querySource = () => read('features', 'platform-automation', 'client-feed-queries.ts')
const componentSource = () => read('features', 'platform-automation', 'components', 'client-feed-gate.tsx')
const pageSource = () => read('features', 'platform-automation', 'components', 'platform-pages.tsx')

const NOT_ADMINISTRATOR = 'Only an organization administrator can manage the client feed.'
const ACKNOWLEDGE_FIRST = "Tick the box to confirm that HIVE's maintainers have been told."
const SAVE_FAILED = 'The setting could not be saved. Please try again.'
const NO_SETTINGS_ROW = 'Save the company details first.'
const SUCCESS_ON = 'Only clients with an accepted quote are now included in the HIVE client feed.'
const SUCCESS_OFF = 'The HIVE client feed includes every client again.'
const EXPLANATION = 'By default HIVE reads every client of this organisation. Turn this on to include only clients with an accepted quote.'
const FIRST_LABEL = 'Only include clients with an accepted quote'
const ACKNOWLEDGEMENT = "I have told HIVE's maintainers that the feed will include only clients with an accepted quote"
const NO_LIVE_KEY = 'No feed key is active yet, so nothing is reading the feed.'
const NEVER_READ = 'HIVE has not read the feed yet'
// What HIVE does with a client that leaves the feed is HIVE's behaviour, which this repository does not show.
const HIVE_NOTE = 'UNISON cannot take back what HIVE has already read; what HIVE does with a client that leaves the feed is up to HIVE.'
// What UNISON may never say about the feed: it cannot see what HIVE did with it.
const FORBIDDEN_WORDING = /handed off|\bsynced\b|\bsynchron|\bcompleted\b|\bfailed\b|\bsent\b/i

// ---------------------------------------------------------------------------------------------------------------
// A recording fake of the signed-in client, and the stubs that put it in place of the server-only modules
// ---------------------------------------------------------------------------------------------------------------

type Call = { kind: 'from' | 'rpc'; name: string; values?: unknown; filters: Array<[string, unknown]>; select?: string; args?: unknown }
type Result = { data: unknown; error: unknown }

const harness = {
  role: 'owner',
  organizationId: 'org-own',
  sessionError: null as unknown,
  calls: [] as Call[],
  order: [] as string[],
  revalidated: [] as string[],
  updateResult: { data: [{ id: 'settings-1' }], error: null } as Result,
  rpcResult: { data: null, error: null } as Result,
  // An answer for one function by name (a thrown value makes that call reject); any other call gets rpcResult.
  rpcByName: {} as Record<string, Result | { throws: unknown }>,
  session() {
    harness.order.push('session')
    if (harness.sessionError) throw harness.sessionError
    return { role: harness.role, organization: { id: harness.organizationId } }
  },
  client() {
    return {
      from(table: string) {
        const call: Call = { kind: 'from', name: table, filters: [] }
        harness.calls.push(call)
        harness.order.push('from')
        const chain = {
          update(values: unknown) {
            call.values = values
            return chain
          },
          eq(column: string, value: unknown) {
            call.filters.push([column, value])
            return chain
          },
          select(columns: string) {
            call.select = columns
            return Promise.resolve(harness.updateResult)
          },
        }
        return chain
      },
      rpc(name: string, args: unknown) {
        harness.calls.push({ kind: 'rpc', name, args, filters: [] })
        harness.order.push('rpc')
        const named = harness.rpcByName[name]
        if (named && 'throws' in named) return Promise.reject(named.throws)
        return Promise.resolve(named ?? harness.rpcResult)
      },
    }
  },
}
;(globalThis as any).__clientFeedGateHarness = harness

beforeEach(() => {
  harness.role = 'owner'
  harness.organizationId = 'org-own'
  harness.sessionError = null
  harness.calls = []
  harness.order = []
  harness.revalidated = []
  harness.updateResult = { data: [{ id: 'settings-1' }], error: null }
  harness.rpcResult = { data: null, error: null }
  harness.rpcByName = {}
})

const NO_SERVER = "async function noServer() { throw new Error('no server in a unit test') }"
installComponentLoader({
  'next/cache': 'export function revalidatePath(path) { globalThis.__clientFeedGateHarness.revalidated.push(path) }',
  '@/lib/auth/get-session-context': 'export async function getSessionContext() { return globalThis.__clientFeedGateHarness.session() }',
  '@/lib/supabase/server': 'export async function createServerSupabase() { return globalThis.__clientFeedGateHarness.client() }',
  // What the components import; the real action is loaded below by its own path.
  '../client-feed-actions': `${NO_SERVER}\nexport const setClientFeedGateAction = noServer\nexport const createClientFeedKeyAction = noServer\nexport const revokeClientFeedKeyAction = noServer`,
  // What the Integrations page imports besides the two feed components and the feed queries, which are the real ones.
  '../queries': `
    export async function getPlatformAutomationAccess() { return { canManage: ['owner', 'admin'].includes(globalThis.__clientFeedGateHarness.role.toLowerCase()) } }
    export async function listIntegrationConnections() { return [] }
    export async function getAutomationMetrics() { return {} }
    export async function listAutomationRules() { return [] }
    export async function listAutomationRuns() { return [] }
    export async function listAutomationSchedules() { return [] }`,
  './automation-nav': 'export function AutomationSettingsNav() { return null }',
  './platform-forms': 'export function AutomationControls() { return null }\nexport function IntegrationControls() { return null }\nexport function IntegrationSecretControl() { return null }',
  '@/components/shared/workspace-header': 'export function WorkspaceHeader() { return null }',
  '@/components/ui/content-panel': 'export function ContentPanel() { return null }',
  '@/components/ui/status-badge': 'export function StatusBadge() { return null }',
  'next/link': 'export default function Link(props) { return props.children ?? null }',
})
const actions = await import('../../features/platform-automation/client-feed-actions.ts')
const queries = await import('../../features/platform-automation/client-feed-queries.ts')
// Loaded when a test needs it, so that a missing component fails its own tests and not the whole file.
const loadComponent = () => import('../../features/platform-automation/components/client-feed-gate.tsx')
const loadPage = () => import('../../features/platform-automation/components/platform-pages.tsx')

const formOf = (entries: Record<string, string> = {}) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(entries)) form.set(name, value)
  return form
}
const run = (entries?: Record<string, string>) => actions.setClientFeedGateAction(undefined, formOf(entries))

// ---------------------------------------------------------------------------------------------------------------
// The action
// ---------------------------------------------------------------------------------------------------------------

test('the action module stays a server-action module: every runtime export is an async function', () => {
  const source = actionSource()
  assert.match(source, /^'use server'/, 'it must be a server-action module')
  const exported = source.split('\n').filter((line) => /^export /.test(line) && !/^export type /.test(line))
  assert.deepEqual(
    exported.map((line) => line.replace(/\(.*$/, '')),
    ['export async function createClientFeedKeyAction', 'export async function revokeClientFeedKeyAction', 'export async function setClientFeedGateAction'],
    'only async functions are exported at runtime (types are erased)',
  )
  assert.match(source, /export async function setClientFeedGateAction\(\s*_previous: ClientFeedGateState,\s*form: FormData,?\s*\): Promise<ClientFeedGateState> \{/)
  assert.match(source, /export type ClientFeedGateState = \{ error\?: string; success\?: string \} \| undefined/)
})

test('the action reads the session and applies the owner/admin rule before its one database call, with the signed-in client only', () => {
  const source = actionSource()
  const body = source.slice(source.indexOf('export async function setClientFeedGateAction'))
  const administrator = body.indexOf('await requireAdministrator()')
  const firstDb = body.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(administrator > -1 && firstDb > administrator, 'requireAdministrator(), then the first database call')
  assert.equal((body.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1, 'exactly one database call')
  assert.match(source, /async function requireAdministrator\(\) \{\s*const context = await getSessionContext\(\)\s*if \(!\['owner', 'admin'\]\.includes\(context\.role\.toLowerCase\(\)\)\)/, 'the session, then the role rule')
  assert.match(body, /\(await createServerSupabase\(\)\) as any/)
  assert.doesNotMatch(source, /supabase\/admin|createAdminClient|SUPABASE_SECRET|SERVICE_ROLE|process\.env/, 'the action uses the signed-in client only')
})

test('the action reads only the enabled and acknowledged fields and writes only the one setting', () => {
  const source = actionSource()
  const body = source.slice(source.indexOf('export async function setClientFeedGateAction'))
  const reads = [...body.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["has('enabled')", "has('acknowledged')"], 'present means true; no other field is read from the form')
  assert.match(body, /\.from\('organization_settings'\)\s*\.update\(\{ hive_feed_requires_accepted_quote: enabled \}\)\s*\.eq\('organization_id', organizationId\)\s*\.select\('id'\)/)
  assert.doesNotMatch(body, /\.upsert\(|\.insert\(|\.delete\(/, 'a switch never creates or removes the settings row')
})

test('a database error is logged on the server and never echoed; it is told apart from a missing row by checking it first', () => {
  const source = actionSource()
  const body = source.slice(source.indexOf('export async function setClientFeedGateAction'))
  assert.match(body, /if \(saved\.error\) \{\s+console\.error\('\[client-feed:gate\]', saved\.error\)\s+return \{ error: [A-Z_]+ \}\s+\}/)
  assert.equal((body.match(/console\.error/g) ?? []).length, 1, 'one log line')
  assert.doesNotMatch(body.slice(body.indexOf('const saved')), /\.message|String\(saved\.error|saved\.error\.|JSON\.stringify/, 'the raw database message is never returned')
  assert.match(body, /catch \(error\) \{[^}]*error\.message === NOT_ADMINISTRATOR \? NOT_ADMINISTRATOR : [A-Z_]+ \}/, 'a session failure shows our own refusal or the generic sentence, never its own message')
  assert.ok(body.indexOf('if (saved.error)') < body.indexOf('if (!saved.data?.length)'), 'a failure is not reported as a missing row')
})

test('the exact sentences are in the action source', () => {
  const source = actionSource()
  for (const sentence of [NOT_ADMINISTRATOR, ACKNOWLEDGE_FIRST, SAVE_FAILED, NO_SETTINGS_ROW, SUCCESS_ON, SUCCESS_OFF]) {
    assert.ok(source.includes(sentence), `missing: ${sentence}`)
  }
  assert.doesNotMatch(source.slice(source.indexOf('export async function setClientFeedGateAction')), FORBIDDEN_WORDING, 'the action never says handed off, sent, synced, completed or failed')
})

for (const role of ['member', 'viewer', 'Member']) {
  test(`a ${role} is refused before any database call`, async () => {
    harness.role = role
    assert.deepEqual(await run({ enabled: 'on', acknowledged: 'on' }), { error: NOT_ADMINISTRATOR })
    assert.deepEqual(await run(), { error: NOT_ADMINISTRATOR })
    assert.deepEqual(harness.calls, [], 'the database is never reached')
    assert.deepEqual(harness.revalidated, [])
  })
}

for (const role of ['owner', 'admin', 'Owner', 'ADMIN']) {
  test(`${role} passes the administrator rule (the role is compared without regard to case)`, async () => {
    harness.role = role
    assert.deepEqual(await run({ enabled: 'on', acknowledged: 'on' }), { success: SUCCESS_ON })
  })
}

test('a failing session gives the generic sentence, not its own message, and reaches no database call', async () => {
  harness.sessionError = Object.assign(new Error('relation "memberships" is unreachable: secret detail'), { code: 'XX000' })
  const result = await run({ enabled: 'on', acknowledged: 'on' })
  assert.deepEqual(result, { error: SAVE_FAILED })
  assert.deepEqual(harness.calls, [])
})

test('turning it on without the acknowledgement is refused with the exact sentence before any database call', async () => {
  assert.deepEqual(await run({ enabled: 'on' }), { error: ACKNOWLEDGE_FIRST })
  assert.deepEqual(harness.calls, [], 'refused before the database, so the action reads no current value either')
  assert.deepEqual(harness.revalidated, [])
  assert.deepEqual(harness.order, ['session'])
})

test('turning it on with the acknowledgement makes exactly one update, scoped to the session organisation, and says what is now on', async () => {
  const result = await run({ enabled: 'on', acknowledged: 'on' })
  assert.deepEqual(result, { success: SUCCESS_ON })
  assert.deepEqual(harness.order, ['session', 'from'], 'the session first, then one database call')
  assert.equal(harness.calls.length, 1)
  const [call] = harness.calls
  assert.equal(call.kind, 'from')
  assert.equal(call.name, 'organization_settings')
  assert.deepEqual(call.values, { hive_feed_requires_accepted_quote: true })
  assert.deepEqual(call.filters, [['organization_id', 'org-own']])
  assert.equal(call.select, 'id')
  assert.deepEqual(harness.revalidated, ['/settings/integrations'])
})

test('turning it off needs no acknowledgement, makes one update and says every client is included again', async () => {
  for (const entries of [{}, { acknowledged: 'on' }] as Array<Record<string, string>>) {
    harness.calls = []
    harness.revalidated = []
    assert.deepEqual(await run(entries), { success: SUCCESS_OFF })
    assert.equal(harness.calls.length, 1)
    assert.deepEqual(harness.calls[0].values, { hive_feed_requires_accepted_quote: false })
    assert.deepEqual(harness.calls[0].filters, [['organization_id', 'org-own']])
    assert.deepEqual(harness.revalidated, ['/settings/integrations'])
  }
})

test('nothing else in the form decides what is written or where: a forged organisation or value is ignored', async () => {
  await run({ enabled: 'on', acknowledged: 'on', organization_id: 'org-other', hive_feed_requires_accepted_quote: 'false', id: 'settings-other' })
  assert.deepEqual(harness.calls[0].values, { hive_feed_requires_accepted_quote: true })
  assert.deepEqual(harness.calls[0].filters, [['organization_id', 'org-own']])
})

test('a database error is logged with its tag and the error object, and the user sees only the generic sentence', async () => {
  const databaseError = { message: 'permission denied for table organization_settings', code: '42501' }
  harness.updateResult = { data: null, error: databaseError }
  const log = mock.method(console, 'error', () => {})
  try {
    const result = await run({ enabled: 'on', acknowledged: 'on' })
    assert.deepEqual(result, { error: SAVE_FAILED })
    assert.doesNotMatch(JSON.stringify(result), /permission denied|42501|organization_settings/)
    assert.equal(log.mock.callCount(), 1)
    assert.deepEqual(log.mock.calls[0].arguments, ['[client-feed:gate]', databaseError])
  } finally {
    log.mock.restore()
  }
  assert.deepEqual(harness.revalidated, [], 'nothing is refreshed when nothing was saved')
})

test('an error with no rows is a failure, not a missing settings row', async () => {
  harness.updateResult = { data: [], error: { message: 'boom', code: '57014' } }
  const log = mock.method(console, 'error', () => {})
  try {
    assert.deepEqual(await run({ enabled: 'on', acknowledged: 'on' }), { error: SAVE_FAILED })
  } finally {
    log.mock.restore()
  }
})

test('no row updated says to save the company details first, and refreshes nothing', async () => {
  for (const data of [[], null]) {
    harness.updateResult = { data, error: null }
    assert.deepEqual(await run({ enabled: 'on', acknowledged: 'on' }), { error: NO_SETTINGS_ROW })
    assert.deepEqual(await run(), { error: NO_SETTINGS_ROW })
  }
  assert.deepEqual(harness.revalidated, [])
})

// ---------------------------------------------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------------------------------------------

const STATUS = {
  gate_enabled: false,
  has_live_key: true,
  last_read_at: '2026-10-24T08:30:00+00:00',
  client: null,
  summary: { total_clients: 12, with_accepted_quote: 5 },
}

test('the gate query gives nothing to anyone but an owner or admin, and does not reach the database for them', async () => {
  for (const role of ['member', 'viewer']) {
    harness.role = role
    harness.rpcResult = { data: STATUS, error: null }
    assert.equal(await queries.getClientFeedGate(), null)
  }
  assert.deepEqual(harness.calls, [])
})

test('the gate query asks the status function through the signed-in client for the session organisation and maps it to camelCase', async () => {
  for (const role of ['owner', 'admin']) {
    harness.role = role
    harness.calls = []
    harness.rpcResult = { data: { ...STATUS, gate_enabled: true }, error: null }
    assert.deepEqual(await queries.getClientFeedGate(), {
      enabled: true,
      hasLiveKey: true,
      lastReadAt: '2026-10-24T08:30:00+00:00',
      totalClients: 12,
      withAcceptedQuote: 5,
    })
    assert.deepEqual(harness.calls.map((call) => [call.kind, call.name, call.args]), [['rpc', 'get_hive_feed_status', { p_organization_id: 'org-own' }]])
  }
})

test('the gate query keeps a feed that has never been read, and an organisation with no live key, as they are', async () => {
  harness.rpcResult = { data: { ...STATUS, has_live_key: false, last_read_at: null, summary: { total_clients: 0, with_accepted_quote: 0 } }, error: null }
  assert.deepEqual(await queries.getClientFeedGate(), { enabled: false, hasLiveKey: false, lastReadAt: null, totalClients: 0, withAcceptedQuote: 0 })
})

test('the gate query returns nothing without the counts, and says nothing about it', async () => {
  harness.rpcResult = { data: { ...STATUS, summary: null }, error: null }
  const log = mock.method(console, 'error', () => {})
  try {
    assert.equal(await queries.getClientFeedGate(), null, 'the counts are for owners and admins only')
    assert.equal(log.mock.callCount(), 0, 'not an error')
  } finally {
    log.mock.restore()
  }
})

// A failure of the status read must not take the Integrations page down with it: that page is where an administrator
// revokes a compromised feed key. So the query gives nothing (the page then leaves the gate section out), logs one line
// with the error CODE alone, and never the message, an address or any data.
const GATE_STATUS_TAG = '[client-feed:gate-status]'
const failureLog = async (failure: Result | { throws: unknown }) => {
  harness.rpcByName = { get_hive_feed_status: failure }
  const log = mock.method(console, 'error', () => {})
  try {
    assert.equal(await queries.getClientFeedGate(), null, 'no gate, and no throw')
    return log.mock.calls.map((call) => call.arguments)
  } finally {
    log.mock.restore()
  }
}

test('a failing status read gives no gate and logs one line with the error code alone', async () => {
  const error = { message: 'permission denied for table organization_settings (client 10 Main Street)', code: '42501', details: 'Key (organization_id)=(org-own) is not present', hint: 'ask a@b.co' }
  assert.deepEqual(await failureLog({ data: null, error }), [[GATE_STATUS_TAG, '42501']])
  assert.deepEqual(await failureLog({ data: STATUS, error }), [[GATE_STATUS_TAG, '42501']], 'an error wins over any data that came with it')
})

test('a status read that throws gives no gate too, and logs only a code it carries', async () => {
  assert.deepEqual(await failureLog({ throws: Object.assign(new Error('fetch failed: connect ECONNREFUSED 10.0.0.5:443'), { code: 'ECONNREFUSED' }) }), [[GATE_STATUS_TAG, 'ECONNREFUSED']])
  assert.deepEqual(await failureLog({ throws: new Error('fetch failed: connect ECONNREFUSED 10.0.0.5:443') }), [[GATE_STATUS_TAG, 'unknown']])
  assert.deepEqual(await failureLog({ throws: null }), [[GATE_STATUS_TAG, 'unknown']])
  assert.deepEqual(await failureLog({ throws: 'a plain string with the address 10.0.0.5' }), [[GATE_STATUS_TAG, 'unknown']])
})

test('an error code is logged only when it is a short plain code; anything else is logged as unknown', async () => {
  for (const code of [undefined, null, 42501, { toString: () => '42501' }, '', 'has a space', 'a@b.co', '10 Main Street', 'x'.repeat(33), `${'x'.repeat(40)} 10 Main Street`]) {
    assert.deepEqual(await failureLog({ data: null, error: { message: 'boom', code } }), [[GATE_STATUS_TAG, 'unknown']], `code ${JSON.stringify(code)}`)
  }
  for (const code of ['42501', 'PGRST202', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT']) {
    assert.deepEqual(await failureLog({ data: null, error: { message: 'boom', code } }), [[GATE_STATUS_TAG, code]], `code ${code}`)
  }
})

test('the failure line is one console.error of the tag and a short string, and the guard sits inside the query', () => {
  const source = querySource()
  const body = source.slice(source.indexOf('export async function getClientFeedGate'))
  assert.equal((body.match(/console\.error/g) ?? []).length, 1, 'one log line')
  assert.match(body, /console\.error\('\[client-feed:gate-status\]', errorCode\(error\)\)/)
  assert.doesNotMatch(body, /console\.error\([^)]*(\.message|JSON\.stringify|String\(error|data)/, 'neither the message nor any data is logged')
  assert.ok(body.indexOf('try {') > body.indexOf("['owner', 'admin'].includes(role.toLowerCase())") && body.indexOf('try {') < body.indexOf('.rpc('), 'the guard wraps the database read, after the role rule')
})

test('the gate query source uses the signed-in client, applies the owner/admin rule first and returns no key detail', () => {
  const source = querySource()
  const body = source.slice(source.indexOf('export async function getClientFeedGate'))
  assert.ok(body.indexOf("['owner', 'admin'].includes(role.toLowerCase())") > -1 && body.indexOf("['owner', 'admin'].includes(role.toLowerCase())") < body.indexOf('.rpc('), 'the role rule precedes the database call')
  assert.match(body, /\(await createServerSupabase\(\)\) as any/)
  assert.doesNotMatch(source, /supabase\/admin|SUPABASE_SECRET|SERVICE_ROLE|process\.env/, 'never a service role')
  assert.doesNotMatch(body, /key_hash|key_name|client_api_keys/, 'no key, key hash or key name is read or returned')
})

// ---------------------------------------------------------------------------------------------------------------
// The component, rendered
// ---------------------------------------------------------------------------------------------------------------

const tags = (html: string, name: string): string[] => [...(html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [])]
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1] ?? null
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|/?>)`, 'i').test(tag)
/** The markup as text a person reads: React's text separators and escaped apostrophes undone. */
const plain = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'")
const input = (html: string, name: string) => tags(html, 'input').find((tag) => attr(tag, 'name') === name)

const GATE = { enabled: false, hasLiveKey: true, lastReadAt: null as string | null, totalClients: 12, withAcceptedQuote: 5 }
const renderGate = async (gate = GATE) => {
  const { ClientFeedGate } = await loadComponent()
  return plain(renderToStaticMarkup(createElement(ClientFeedGate, { gate })))
}
const renderFields = async (gate: typeof GATE, wanted: boolean) => {
  const { FeedGateFields } = await loadComponent()
  return plain(renderToStaticMarkup(createElement(FeedGateFields, { gate, wanted, onWanted: () => {} })))
}

test('the section explains the default, previews the effect and shows the first checkbox unticked while the setting is off', async () => {
  const html = await renderGate()
  assert.match(html, /<h2[^>]*>HIVE client feed<\/h2>/)
  assert.ok(html.includes(EXPLANATION), 'the explanation, word for word')
  assert.ok(html.includes(`Today 5 of 12 clients have an accepted quote. Turning this on removes the other 7 from the feed. ${HIVE_NOTE}`))
  const first = input(html, 'enabled')
  assert.ok(first, 'a checkbox named enabled')
  assert.equal(attr(first, 'type'), 'checkbox')
  assert.equal(hasAttr(first, 'checked'), false, 'unticked while the saved setting is off')
  assert.match(html, new RegExp(`<label[^>]*><input[^>]*name="enabled"[^>]*/><span>${FIRST_LABEL}</span></label>`), 'the checkbox is labelled')
  assert.equal(input(html, 'acknowledged'), undefined, 'no acknowledgement to give while the first box is unticked')
})

test('while the setting is on, the first checkbox is ticked and the acknowledgement is pre-ticked: re-saving does not ask again', async () => {
  const html = await renderGate({ ...GATE, enabled: true })
  assert.equal(hasAttr(input(html, 'enabled')!, 'checked'), true)
  const acknowledged = input(html, 'acknowledged')
  assert.ok(acknowledged, 'the acknowledgement is shown while the first box is ticked')
  assert.equal(hasAttr(acknowledged, 'checked'), true, 'it was acknowledged when the setting was switched on')
  assert.ok(html.includes(`Today 5 of 12 clients have an accepted quote. The other 7 are not in the feed. ${HIVE_NOTE}`), 'once on, it no longer says turning it on will remove them')
  assert.doesNotMatch(html, /Turning this on removes/)
})

test('ticking the first checkbox while the setting is off shows the acknowledgement, labelled exactly and unticked', async () => {
  const html = await renderFields(GATE, true)
  const acknowledged = input(html, 'acknowledged')
  assert.ok(acknowledged, 'the acknowledgement is shown whenever the first box is ticked')
  assert.equal(attr(acknowledged, 'type'), 'checkbox')
  assert.equal(hasAttr(acknowledged, 'checked'), false, 'it starts unticked, because the saved setting is off')
  assert.equal(hasAttr(acknowledged, 'required'), true, 'the browser asks for it before the server has to')
  assert.match(html, new RegExp(`<label[^>]*><input[^>]*name="acknowledged"[^>]*/><span>${ACKNOWLEDGEMENT}</span></label>`), 'the checkbox is labelled with the exact sentence')
  assert.equal(hasAttr(input(html, 'enabled')!, 'checked'), true)
})

test('unticking the first checkbox hides the acknowledgement: turning it off needs none', async () => {
  for (const enabled of [false, true]) {
    const html = await renderFields({ ...GATE, enabled }, false)
    assert.equal(hasAttr(input(html, 'enabled')!, 'checked'), false)
    assert.equal(input(html, 'acknowledged'), undefined)
  }
})

test('the first checkbox is described by the explanation and the effect, and both exist', async () => {
  const html = await renderFields(GATE, false)
  const described = attr(input(html, 'enabled')!, 'aria-describedby')
  assert.ok(described, 'aria-describedby')
  const ids = described.split(' ')
  assert.equal(ids.length, 2)
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `an element with id ${id}`)
  assert.ok(html.indexOf(`id="${ids[0]}"`) < html.indexOf(EXPLANATION) && html.indexOf(EXPLANATION) < html.indexOf(`id="${ids[1]}"`), 'the explanation, then the effect')
})

test('the section says when no key is active and when HIVE last read the feed, in South African time', async () => {
  const none = await renderGate({ ...GATE, hasLiveKey: false })
  assert.ok(none.includes(NO_LIVE_KEY))
  assert.ok(none.includes(NEVER_READ))
  const keyed = await renderGate({ ...GATE, lastReadAt: '2026-10-24T22:30:00+00:00' })
  assert.ok(!keyed.includes(NO_LIVE_KEY), 'only when there is no live key')
  assert.ok(!keyed.includes(NEVER_READ))
  assert.ok(keyed.includes('HIVE last read the feed 25 Oct 2026, 00:30'), 'UTC 22:30 is half past midnight the next day in Johannesburg')
  const keyedNever = await renderGate()
  assert.ok(keyedNever.includes(NEVER_READ) && !keyedNever.includes(NO_LIVE_KEY))
})

test('no effect line claims what HIVE keeps: what HIVE does with a client that leaves the feed is up to HIVE', async () => {
  for (const gate of [GATE, { ...GATE, enabled: true }, { ...GATE, hasLiveKey: false }, { ...GATE, lastReadAt: '2026-10-24T08:30:00+00:00' }]) {
    const html = await renderGate(gate)
    assert.doesNotMatch(html, /HIVE keeps/, 'UNISON does not say what HIVE keeps')
    assert.equal(html.split(HIVE_NOTE).length - 1, 1, 'the one sentence that says UNISON cannot take it back, once')
  }
  assert.doesNotMatch(componentSource(), /HIVE keeps/, 'nor does the source')
})

test('the form has a button that submits, and a polite status region that is always in the page for the result', async () => {
  const html = await renderGate()
  const buttons = tags(html, 'button')
  assert.equal(buttons.length, 1)
  assert.equal(attr(buttons[0], 'type'), 'submit')
  assert.match(html, /<button[^>]*>Save feed setting<\/button>/)
  const live = tags(html, 'div').filter((tag) => attr(tag, 'aria-live') === 'polite')
  assert.equal(live.length, 1, 'one polite live region')
  assert.equal(attr(live[0], 'role'), 'status')
  assert.equal(tags(html, 'form').length, 1)
})

test('nothing the component says claims a hand-off, a sync, a completion or a failure', async () => {
  for (const gate of [GATE, { ...GATE, enabled: true }, { ...GATE, hasLiveKey: false }, { ...GATE, lastReadAt: '2026-10-24T08:30:00+00:00' }]) {
    assert.doesNotMatch(await renderGate(gate), FORBIDDEN_WORDING)
  }
  assert.doesNotMatch(await renderFields(GATE, true), FORBIDDEN_WORDING)
  assert.doesNotMatch(componentSource(), FORBIDDEN_WORDING, 'nor does its source')
})

test('the component is a client form that calls the action by hand, so React does not reset the checkboxes, and renders no raw HTML', () => {
  const source = componentSource()
  assert.match(source, /^'use client'/)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'text is never rendered as HTML')
  assert.match(source, /import \{ setClientFeedGateAction \} from '\.\.\/client-feed-actions'/)
  assert.match(source, /import type \{ ClientFeedGateStatus \} from '\.\.\/client-feed-queries'/, 'the query module is imported for its type only')
  assert.match(source, /useActionState\(setClientFeedGateAction, undefined\)/)
  assert.match(source, /export function ClientFeedGate\(\{ gate \}: \{ gate: ClientFeedGateStatus \}\)/)
  assert.doesNotMatch(source, /<form\s+action=/, 'React resets a <form action> after it runs')
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
  assert.doesNotMatch(source, /server-only|lib\/supabase|lib\/auth/, 'a client component imports no server code')
})

test('the acknowledgement defaults to the saved setting and is asked for in the browser as well as on the server', () => {
  const source = componentSource()
  assert.match(source, /<input\s[^>]*type="checkbox"\s[^>]*name="acknowledged"\s[^>]*defaultChecked=\{gate\.enabled\}/, 'pre-ticked only when the saved setting is already on')
  assert.match(source, /wanted \? \(/, 'shown whenever the first checkbox is ticked')
  assert.match(source, /name="enabled"\s[^>]*checked=\{wanted\}/)
  assert.ok(source.includes(`"${ACKNOWLEDGEMENT}"`) || source.includes(`'${ACKNOWLEDGEMENT}'`) || source.includes(ACKNOWLEDGEMENT), 'the exact label')
})

test('success is hidden once anything changes again, and an error shows in an alert', () => {
  const source = componentSource()
  assert.match(source, /onChange=\{\(\) => setDirty\(true\)\}/)
  assert.match(source, /setDirty\(false\)/)
  assert.match(source, /state\?\.success && !dirty && !pending/)
  assert.match(source, /<p role="alert"/)
  assert.match(source, /timeZone: 'Africa\/Johannesburg'/)
})

// ---------------------------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------------------------

test('the integrations page loads and renders the gate only for a viewer who can manage, between the register and the key table', () => {
  const source = pageSource()
  assert.match(source, /import \{ getClientFeedGate, listClientFeedKeys \} from '\.\.\/client-feed-queries'/)
  assert.match(source, /import \{ ClientFeedGate \} from '\.\/client-feed-gate'/)
  assert.match(source, /const \[feedKeys, feedGate\] = access\.canManage \? await Promise\.all\(\[listClientFeedKeys\(\), getClientFeedGate\(\)\]\) : \[\[\], null\]/, 'nothing is read for a viewer who cannot manage')
  assert.match(source, /\{access\.canManage && feedGate \? <ClientFeedGate gate=\{feedGate\} \/> : null\}/)
  const register = source.indexOf('Connection register')
  const gate = source.indexOf('<ClientFeedGate ')
  const keys = source.indexOf('<ClientFeedKeys ')
  assert.ok(register > -1 && gate > register && keys > gate, 'the register, then the gate, then the keys')
  assert.equal((source.match(/<ClientFeedGate /g) ?? []).length, 1)
  assert.match(source, /\{access\.canManage \? <ClientFeedKeys keys=\{feedKeys\} \/> : null\}/, 'the key table is as it was: it does not depend on the gate value')
})

test('a failure of the status read does not take down the Integrations page: the key table renders, the gate section is left out', async () => {
  harness.rpcByName = {
    list_client_feed_keys: {
      data: [{ id: 'key-1', name: 'HIVE production feed', created_at: '2026-10-01T08:00:00+00:00', last_used_at: null, revoked_at: null }],
      error: null,
    },
    get_hive_feed_status: { data: null, error: { message: 'function get_hive_feed_status does not exist', code: '42883' } },
  }
  const { IntegrationsPage } = await loadPage()
  const log = mock.method(console, 'error', () => {})
  let html: string
  try {
    html = plain(renderToStaticMarkup(await IntegrationsPage()))
    assert.deepEqual(log.mock.calls.map((call) => call.arguments), [[GATE_STATUS_TAG, '42883']], 'one line, with the code alone')
  } finally {
    log.mock.restore()
  }
  assert.ok(html.includes('Client feed keys') && html.includes('HIVE production feed'), 'the key table is there, with the key')
  assert.match(html, /<button[^>]*>[^]*Revoke<\/button>/, 'and the administrator can still revoke a key')
  assert.ok(!html.includes('HIVE client feed'), 'only the gate section is left out')
  assert.ok(!html.includes('name="enabled"'))

  // The same page when the status read works, so the absence above is the failure and nothing else.
  harness.rpcByName.get_hive_feed_status = { data: STATUS, error: null }
  const healthy = plain(renderToStaticMarkup(await IntegrationsPage()))
  assert.ok(healthy.includes('HIVE client feed') && healthy.includes('name="enabled"'), 'the gate section is there')
  assert.ok(healthy.includes('Client feed keys') && healthy.includes('HIVE production feed'), 'beside the key table')
  assert.ok(healthy.indexOf('HIVE client feed') < healthy.indexOf('Client feed keys'), 'above it, as before')
})
