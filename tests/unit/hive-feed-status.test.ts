import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { beforeEach, mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { installComponentLoader } from './support/component-loader.ts'

// Quote portal, slice 3, task 4: what staff see on a quote about the HIVE client feed.
//
// The sentences are a pure function (features/platform-automation/feed-status.ts) and are run here case by case. The
// server component is run for real against a recording fake of the signed-in member's client (the document context and
// the quote loader are stubbed through tests/unit/support/component-loader.ts), then its markup is rendered with
// react-dom/server, so what is asserted about the one database call, the sentences, the nothing-to-show cases and the
// log line is behaviour, not text. What only the database can show (the status function itself) is covered by the slice
// 3 database tests, and the mount on the page is guarded by the source. Nothing in this file touches a database.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const pureSource = () => read('features', 'platform-automation', 'feed-status.ts')
const componentSource = () => read('features', 'platform-automation', 'components', 'hive-feed-status.tsx')
const pageSource = () => read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')

// What UNISON may never say about the feed: it cannot see what HIVE did with it.
const FORBIDDEN_WORDING = /handed off|\bsynced\b|\bsynchron|\bcompleted\b|\bfailed\b|\bsent\b/i

const EVERY_CLIENT = 'The HIVE client feed currently includes every client.'
const NOT_INCLUDED = 'Not included in the HIVE client feed (no accepted quote).'
const NEVER_READ = 'HIVE has not read the feed yet.'

// Loaded when a test needs them, so that a missing module fails its own tests and not the whole file.
const loadPure = () => import('../../features/platform-automation/feed-status.ts')
const loadComponent = () => import('../../features/platform-automation/components/hive-feed-status.tsx')

// ---------------------------------------------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------------------------------------------

type Client = { included: boolean; since: string | null } | null
const status = (overrides: { gateEnabled?: boolean; hasLiveKey?: boolean; lastReadAt?: string | null; client?: Client } = {}) => ({
  gateEnabled: false,
  hasLiveKey: true,
  lastReadAt: null as string | null,
  client: { included: true, since: null } as Client,
  ...overrides,
})

test('with no live key there is nothing to say, whatever else is true', async () => {
  const { feedStatusLines } = await loadPure()
  for (const gateEnabled of [false, true]) {
    for (const client of [{ included: true, since: null }, { included: true, since: '2026-10-20T08:00:00+00:00' }, { included: false, since: null }]) {
      assert.equal(feedStatusLines(status({ gateEnabled, hasLiveKey: false, lastReadAt: '2026-10-24T08:30:00+00:00', client })), null)
    }
  }
})

test('with no client there is nothing to say, whatever else is true', async () => {
  const { feedStatusLines } = await loadPure()
  for (const gateEnabled of [false, true]) {
    for (const lastReadAt of [null, '2026-10-24T08:30:00+00:00']) {
      assert.equal(feedStatusLines(status({ gateEnabled, lastReadAt, client: null })), null)
    }
  }
})

test('with the gate off the feed includes every client, and only the last read is detail', async () => {
  const { feedStatusLines } = await loadPure()
  assert.deepEqual(feedStatusLines(status()), { headline: EVERY_CLIENT, detail: NEVER_READ })
  assert.deepEqual(feedStatusLines(status({ lastReadAt: '2026-10-24T08:30:00+00:00' })), { headline: EVERY_CLIENT, detail: 'HIVE last read the feed 24 Oct 2026, 10:30.' })
})

test('with the gate on, a client with an accepted quote is included since the date of it, in South African time', async () => {
  const { feedStatusLines } = await loadPure()
  const lines = feedStatusLines(status({ gateEnabled: true, client: { included: true, since: '2026-10-20T08:00:00+00:00' } }))
  assert.deepEqual(lines, { headline: 'Included in the HIVE client feed since 20 Oct 2026.', detail: NEVER_READ })
  // 22:30 UTC on the 24th is half past midnight on the 25th in Johannesburg: the date is South African, not UTC.
  const lateEvening = feedStatusLines(status({ gateEnabled: true, client: { included: true, since: '2026-10-24T22:30:00+00:00' } }))
  assert.equal(lateEvening?.headline, 'Included in the HIVE client feed since 25 Oct 2026.')
})

test('with the gate on, a client with no accepted quote is not included, and says why', async () => {
  const { feedStatusLines } = await loadPure()
  assert.deepEqual(feedStatusLines(status({ gateEnabled: true, client: { included: false, since: null } })), { headline: NOT_INCLUDED, detail: NEVER_READ })
  assert.equal(feedStatusLines(status({ gateEnabled: true, client: { included: false, since: '2026-10-20T08:00:00+00:00' } }))?.headline, NOT_INCLUDED, 'a date is not shown for a client that is not included')
})

test('the detail says when HIVE last read the feed, in South African time, or that it has not read it yet', async () => {
  const { feedStatusLines } = await loadPure()
  for (const gateEnabled of [false, true]) {
    const client = { included: gateEnabled ? false : true, since: null }
    assert.equal(feedStatusLines(status({ gateEnabled, client, lastReadAt: '2026-10-24T22:30:00+00:00' }))?.detail, 'HIVE last read the feed 25 Oct 2026, 00:30.')
    assert.equal(feedStatusLines(status({ gateEnabled, client, lastReadAt: null }))?.detail, NEVER_READ)
  }
})

test('a date that cannot be read does not throw, and is answered with a neutral phrase', async () => {
  const { feedStatusLines } = await loadPure()
  for (const bad of ['not a date', '', '2026-13-45T99:99:99Z']) {
    assert.deepEqual(feedStatusLines(status({ lastReadAt: bad })), { headline: EVERY_CLIENT, detail: 'HIVE last read the feed at an unknown time.' })
    assert.equal(feedStatusLines(status({ gateEnabled: true, client: { included: true, since: bad } }))?.headline, 'Included in the HIVE client feed since an unknown date.')
  }
  // A client that is included with the gate on always has a date; if it does not, the sentence still reads.
  assert.equal(feedStatusLines(status({ gateEnabled: true, client: { included: true, since: null } }))?.headline, 'Included in the HIVE client feed since an unknown date.')
})

test('no sentence claims a hand-off, a sync, a completion or a failure, even for a date it cannot read', async () => {
  const { feedStatusLines } = await loadPure()
  for (const gateEnabled of [false, true]) {
    for (const client of [{ included: true, since: '2026-10-20T08:00:00+00:00' }, { included: true, since: 'junk' }, { included: true, since: null }, { included: false, since: null }]) {
      for (const lastReadAt of [null, '2026-10-24T08:30:00+00:00', 'junk']) {
        const lines = feedStatusLines(status({ gateEnabled, client, lastReadAt }))
        assert.ok(lines)
        assert.doesNotMatch(`${lines.headline} ${lines.detail}`, FORBIDDEN_WORDING)
      }
    }
  }
})

test('the pure module stays loadable by node --test: relative imports only, no server-only, no directive, no wording that claims a result', () => {
  const source = pureSource()
  assert.doesNotMatch(source, /from '@\/|server-only/, 'no @/ import and no server-only')
  assert.doesNotMatch(source, /^'use (client|server)'/m, 'no directive')
  assert.doesNotMatch(source, /process\.env|supabase/i, 'it reads nothing')
  assert.doesNotMatch(source, FORBIDDEN_WORDING, 'its source never says handed off, sent, synced, completed or failed')
  assert.match(source, /export type \w+ = \{\s*gateEnabled: boolean/, 'the input type is exported from the same file')
  assert.match(source, /Africa\/Johannesburg/, 'South African time, whatever the server clock is set to')
})

// ---------------------------------------------------------------------------------------------------------------
// The server component, run against a recording fake of the signed-in client
// ---------------------------------------------------------------------------------------------------------------

type Call = { kind: 'rpc' | 'from'; name: string; args?: unknown }

const harness = {
  bundle: null as { record: Record<string, unknown> } | null,
  organizationId: 'org-own',
  rpcResult: { data: null as unknown, error: null as unknown },
  calls: [] as Call[],
  documentLoads: [] as Array<[string, string]>,
  getDocument(kind: string, id: string) {
    harness.documentLoads.push([kind, id])
    return Promise.resolve(harness.bundle)
  },
  context() {
    return {
      organization: { id: harness.organizationId },
      db: {
        rpc(name: string, args: unknown) {
          harness.calls.push({ kind: 'rpc', name, args })
          return Promise.resolve(harness.rpcResult)
        },
        from(table: string) {
          harness.calls.push({ kind: 'from', name: table })
          throw new Error('the status component must not select from a table')
        },
      },
    }
  },
}
;(globalThis as any).__hiveFeedStatusHarness = harness

const CLIENT_ID = '00000000-0000-4000-8000-0000000000c1'
const QUOTE_ID = '00000000-0000-4000-8000-0000000000a1'

// What the status function returns for a member; an owner or admin also gets summary counts.
const rpcStatus = (overrides: Record<string, unknown> = {}) => ({
  gate_enabled: false,
  has_live_key: true,
  last_read_at: null,
  client: { included: true, since: null },
  summary: null,
  ...overrides,
})

beforeEach(() => {
  harness.bundle = { record: { client_id: CLIENT_ID, status: 'Accepted' } }
  harness.organizationId = 'org-own'
  harness.rpcResult = { data: rpcStatus(), error: null }
  harness.calls = []
  harness.documentLoads = []
})

installComponentLoader({
  '@/features/documents/queries/get-document': 'export async function getDocument(kind, id) { return globalThis.__hiveFeedStatusHarness.getDocument(kind, id) }',
  '@/features/documents/server-context': 'export async function documentContext() { return globalThis.__hiveFeedStatusHarness.context() }',
})

/** What the component returns, rendered; null when it renders nothing. */
const render = async (quoteId = QUOTE_ID) => {
  const { HiveFeedStatus } = await loadComponent()
  const element = await HiveFeedStatus({ quoteId })
  return element === null ? null : renderToStaticMarkup(element)
}
/** The text of the markup, one entry per piece of text, in order. */
const texts = (html: string) => html.replace(/<[^>]+>/g, '|').split('|').filter((piece) => piece !== '')

test('the component asks the status function once, through the signed-in client, for the session organisation and the quote client', async () => {
  await render()
  assert.deepEqual(harness.documentLoads, [['quote', QUOTE_ID]])
  assert.deepEqual(harness.calls, [{ kind: 'rpc', name: 'get_hive_feed_status', args: { p_organization_id: 'org-own', p_client_id: CLIENT_ID } }])
})

test('gate off: a titled panel says the feed includes every client and when HIVE last read it', async () => {
  harness.rpcResult = { data: rpcStatus({ last_read_at: '2026-10-24T22:30:00+00:00' }), error: null }
  const html = await render()
  assert.ok(html)
  assert.match(html, /<section\b/)
  assert.match(html, /<h2[^>]*>HIVE client feed<\/h2>/)
  assert.deepEqual(texts(html), ['HIVE client feed', EVERY_CLIENT, 'HIVE last read the feed 25 Oct 2026, 00:30.'])
})

test('gate on and included: the panel says since when, and that HIVE has not read the feed yet', async () => {
  harness.rpcResult = { data: rpcStatus({ gate_enabled: true, client: { included: true, since: '2026-10-20T08:00:00+00:00' } }), error: null }
  assert.deepEqual(texts((await render())!), ['HIVE client feed', 'Included in the HIVE client feed since 20 Oct 2026.', NEVER_READ])
})

test('gate on and not included: the panel says there is no accepted quote', async () => {
  harness.rpcResult = { data: rpcStatus({ gate_enabled: true, last_read_at: '2026-10-24T08:30:00+00:00', client: { included: false, since: null } }), error: null }
  assert.deepEqual(texts((await render())!), ['HIVE client feed', NOT_INCLUDED, 'HIVE last read the feed 24 Oct 2026, 10:30.'])
})

test('an owner or admin gets counts from the status function; the panel shows none of them', async () => {
  harness.rpcResult = { data: rpcStatus({ summary: { total_clients: 12, with_accepted_quote: 5 } }), error: null }
  assert.deepEqual(texts((await render())!), ['HIVE client feed', EVERY_CLIENT, NEVER_READ])
})

test('no heading, no panel and no markup at all when the organisation has no live key', async () => {
  harness.rpcResult = { data: rpcStatus({ has_live_key: false, gate_enabled: true, client: { included: false, since: null } }), error: null }
  assert.equal(await render(), null)
})

test('nothing is rendered when the status function does not know the client', async () => {
  harness.rpcResult = { data: rpcStatus({ client: null }), error: null }
  assert.equal(await render(), null)
})

test('a quote with no client (a lead-only quote) renders nothing and does not ask the database', async () => {
  for (const clientId of [null, undefined, '']) {
    harness.bundle = { record: { client_id: clientId } }
    harness.calls = []
    assert.equal(await render(), null)
    assert.deepEqual(harness.calls, [])
  }
})

test('a quote that cannot be loaded renders nothing and does not ask the database', async () => {
  harness.bundle = null
  assert.equal(await render(), null)
  assert.deepEqual(harness.calls, [])
})

test('a status that is not the shape the function returns renders nothing rather than a guess', async () => {
  for (const data of [null, undefined, 'status', 42, {}, { has_live_key: true, client: { included: true, since: null } }]) {
    harness.rpcResult = { data, error: null }
    assert.equal(await render(), null)
  }
})

test('an error from the status function renders nothing and logs one line: the tag and the error code, no data', async () => {
  harness.rpcResult = {
    data: null,
    error: { message: 'permission denied for alice@example.com org-own key_hash=abc123', code: '42501', details: 'client 00000000-0000-4000-8000-0000000000c1', hint: 'secret' },
  }
  const log = mock.method(console, 'error', () => {})
  try {
    assert.equal(await render(), null)
    assert.equal(log.mock.callCount(), 1, 'one log line')
    assert.deepEqual(log.mock.calls[0].arguments, ['[hive-feed:status]', '42501'])
  } finally {
    log.mock.restore()
  }
})

test('an error with no usable code is logged as unknown, never with its message', async () => {
  const log = mock.method(console, 'error', () => {})
  try {
    for (const error of [{ message: 'boom with an address a@b.test' }, { message: 'boom', code: '' }, { message: 'boom', code: 500 }]) {
      log.mock.resetCalls()
      harness.rpcResult = { data: null, error }
      assert.equal(await render(), null)
      assert.deepEqual(log.mock.calls.map((call) => call.arguments), [['[hive-feed:status]', 'unknown']])
    }
  } finally {
    log.mock.restore()
  }
})

test('nothing the panel says claims a hand-off, a sync, a completion or a failure', async () => {
  for (const gate_enabled of [false, true]) {
    for (const client of [{ included: true, since: '2026-10-20T08:00:00+00:00' }, { included: true, since: 'junk' }, { included: false, since: null }]) {
      for (const last_read_at of [null, '2026-10-24T08:30:00+00:00', 'junk']) {
        harness.rpcResult = { data: rpcStatus({ gate_enabled, client, last_read_at }), error: null }
        assert.doesNotMatch((await render())!, FORBIDDEN_WORDING)
      }
    }
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Source guards
// ---------------------------------------------------------------------------------------------------------------

test('the component source calls only get_hive_feed_status, through the member\'s session, and selects nothing', () => {
  const source = componentSource()
  assert.deepEqual(source.match(/\.rpc\(\s*'[a-z_]+'/g), [".rpc('get_hive_feed_status'"], 'one call, to the status function')
  assert.doesNotMatch(source, /\.from\(|\.select\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/, 'it reads no table and writes nothing')
  assert.doesNotMatch(source, /key_hash|key_name|client_api_keys|api_key|last_used_at/i, 'it never touches a key column')
  assert.doesNotMatch(source, /supabase\/admin|createAdminClient|SUPABASE_SECRET|SERVICE_ROLE|process\.env/, 'never a service role or an environment variable')
  assert.match(source, /import \{ documentContext \} from '@\/features\/documents\/server-context'/)
  assert.match(source, /import \{ getDocument \} from '@\/features\/documents\/queries\/get-document'/)
  assert.match(source, /import \{ feedStatusLines/, 'the sentences come from the pure module')
  assert.doesNotMatch(source, /^'use (client|server)'/m, 'a server component: no directive')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'text is never rendered as HTML')
  assert.match(source, /export async function HiveFeedStatus\(\{ quoteId \}: \{ quoteId: string \}\)/)
})

test('the component logs once, with the tag and the error code only', () => {
  const source = componentSource()
  assert.deepEqual(source.match(/console\.\w+\(.*\)/g), ["console.error('[hive-feed:status]', code)"], 'one log line, of the tag and the code')
  assert.doesNotMatch(source, /console\.\w+\([^)]*(error\)|\.message|JSON\.stringify|data)/, 'the error object, its message and the data are never logged')
})

test('the component source never says handed off, sent, synced, completed or failed', () => {
  assert.doesNotMatch(componentSource(), FORBIDDEN_WORDING)
})

test('the quote page mounts the feed status directly after the client portal panel, once', () => {
  const source = pageSource()
  assert.match(source, /import \{ HiveFeedStatus \} from '@\/features\/platform-automation\/components\/hive-feed-status'/)
  assert.equal((source.match(/<HiveFeedStatus /g) ?? []).length, 1)
  // The billing plan panel (accept to invoice, stage 1, task 9) sits between the client portal panel and the feed status.
  assert.match(source, /<ClientResponsePanel quoteId=\{quoteId\} \/>\n\s*(<BillingPlanPanel quoteId=\{quoteId\} \/>\n\s*)?<HiveFeedStatus quoteId=\{quoteId\} \/>\n\s*<QuoteInvoices quoteId=\{quoteId\} \/>/, 'after ClientResponsePanel (and the billing plan panel) and before QuoteInvoices, as the brief puts it')
})
