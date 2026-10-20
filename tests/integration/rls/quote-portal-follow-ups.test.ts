import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { must, quoteRow, setupPortalOrg, type PortalMember, type PortalOrg } from './portal-fixtures.ts'

// Quote portal, slice 2, task 5: what follows a decision. portal_decide calls private.decision_follow_ups inside the
// decision's transaction: the quote's owner and the member who sent the link get an in-app notice, and a decline leaves a
// recovery task (a note instead when the client chose another provider). Every decision here is made as the client makes
// it (portal_get_quote, portal_issue_code, portal_decide through the service role), and what the follow-ups wrote is
// read as the difference between the organisation's tasks, notes and notices before and after the call.
// private.decision_recipients is replaced in the same migration so that archived team members are passed over; the
// fallback test covers it through portal_decide's owner_name and notify_email and through what is written.

type Row = Record<string, any>

let fx: PortalOrg
const extraUsers: string[] = []
let opportunityId: string
/** A login whose team profile is archived: as an owner it is passed over for the sender. */
let archivedOwner: PortalMember
/** A login whose team profile is archived: as the sender of a link it is neither told nor assigned. */
let archivedSender: PortalMember
/** A login with no team profile: told as the sender, never assigned. */
let noProfile: PortalMember

/** A signed-in member of the fixture organisation; with a team profile linked to the login unless the name is null. */
const extraMember = async (fullName: string | null, archived = false): Promise<PortalMember> => {
  const user = await createFixtureUser(fx.orgId, 'member')
  extraUsers.push(user.id)
  const client = await signedInClient(user.email, user.password)
  if (fullName === null) return { userId: user.id, email: user.email, client, teamMemberId: '' }
  const profile = must(await admin.from('team_members').insert({ organization_id: fx.orgId, full_name: fullName, email: user.email, job_title: 'Consultant' })
    .select('id,user_id').single())
  assert.equal(profile.user_id, user.id, `${fullName}'s profile is linked to the login`)
  if (archived) assert.equal((await admin.from('team_members').update({ archived_at: new Date().toISOString() }).eq('id', profile.id)).error, null)
  return { userId: user.id, email: user.email, client, teamMemberId: profile.id as string }
}

before(async () => {
  fx = await setupPortalOrg('portal-follow-ups')
  archivedOwner = await extraMember('Archie Archived', true)
  archivedSender = await extraMember('Ada Archived', true)
  noProfile = await extraMember(null)
  opportunityId = must(await admin.from('sales_opportunities').insert({
    organization_id: fx.orgId, name: 'Portal renewal', client_id: fx.clientId, client_name: 'Portal Client', stage: 'Proposal',
    owner_id: fx.owner.teamMemberId, expected_value: 1000, probability_percent: 60,
  }).select('id').single()).id as string
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    // The extra members are made here, so their logins are removed here (their memberships and profiles went with the organisation).
    if (extraUsers.length > 0) await cleanup([], extraUsers)
  }
})

const DAY = 86_400_000
const CONSENT_ACCEPT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'
const CONSENT_DECLINE = 'I confirm that I am authorised to decline this quotation on behalf of the organisation.'
/** The brief's table: the recommended action for each reason that calls for a task. */
const ACTIONS: Record<string, string> = {
  'Budget considerations': 'Review whether a smaller, clearly scoped engagement could meet their most important need. Do not discount automatically.',
  'Timing is not right': 'Offer to reconnect on a date the client chooses.',
  'Scope does not meet our requirements': 'Offer a discovery conversation and a revised quotation if the need can be met.',
  'Internal approval pending': 'Offer a concise business case, supporting documents or an executive conversation.',
  Other: 'One courteous, optional follow-up if it suits the relationship.',
}
const COURTEOUS = ACTIONS.Other
const ANOTHER_PROVIDER = 'Thank them and close the opportunity respectfully, no repeated contact.'
const TASK_KEYS = [
  'organization_id', 'title', 'description', 'client_id', 'opportunity_id', 'lead_id', 'project_id', 'onboarding_id', 'assignee_id',
  'created_by', 'priority', 'status', 'completed_at', 'archived_at',
]
const NOTE_KEYS = ['organization_id', 'kind', 'subject', 'body', 'details', 'created_by', 'lead_id', 'client_id', 'opportunity_id', 'quote_id']
const NOTICE_KEYS = ['organization_id', 'title', 'body', 'category', 'href', 'read_at']

const time = (value: string) => new Date(value).getTime()
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map((key) => [key, row[key]]))
const recipients = (notices: Row[]) => notices.map((notice) => notice.user_id as string).sort()
const sorted = (...ids: string[]) => [...ids].sort()
/** The task description (and note body): the recommended action, the reason, and the client's comments when given. */
const recoveryText = (action: string, reason: string | null, comments: string | null = null) =>
  `${action}\n\nReason given: ${reason ?? 'none given'}.` + (comments === null ? '' : `\n\nClient's comments:\n${comments}`)

const portal = async (token: string) => {
  const { data, error } = await admin.rpc('portal_get_quote', { p_token: token })
  assert.equal(error, null)
  return data as Row
}
const issueCode = async (token: string) => {
  const { data, error } = await admin.rpc('portal_issue_code', { p_token: token })
  assert.equal(error, null)
  assert.equal(data.ok, true, `a code is issued: ${JSON.stringify(data)}`)
  return data.code as string
}
type Ready = { token: string; hash: string; code: string }
const ready = async (token: string): Promise<Ready> => {
  const page = await portal(token)
  assert.equal(page.state, 'open', 'the page is open')
  return { token, hash: page.snapshot_hash, code: await issueCode(token) }
}
const decisionArgs = (r: Ready, decision: 'accepted' | 'declined', overrides: Record<string, unknown> = {}) => ({
  p_token: r.token,
  p_code: r.code,
  p_decision: decision,
  p_signatory_name: 'Pat Client',
  p_signatory_position: 'Managing Director',
  p_signatory_organisation: 'Portal Client (Pty) Ltd',
  p_consent_text: decision === 'accepted' ? CONSENT_ACCEPT : CONSENT_DECLINE,
  p_consent: true,
  p_snapshot_hash: r.hash,
  p_decline_reason: null,
  p_decline_comments: null,
  p_ip: '203.0.113.7',
  p_user_agent: 'Mozilla/5.0 (portal follow-ups test)',
  ...overrides,
})
const decide = async (input: Record<string, unknown>) => {
  const { data, error } = await admin.rpc('portal_decide', input)
  assert.equal(error, null, error?.message)
  assert.equal(data.ok, true, `the decision is recorded: ${JSON.stringify(data)}`)
  return data as Row
}

/** Everything the follow-ups can write in the organisation. */
const followUpRows = async () => ({
  tasks: must(await admin.from('tasks').select('*').eq('organization_id', fx.orgId)) as Row[],
  notes: must(await admin.from('activities').select('*').eq('organization_id', fx.orgId).eq('kind', 'note')) as Row[],
  notices: must(await admin.from('notifications').select('*').eq('organization_id', fx.orgId)) as Row[],
})
type Written = Awaited<ReturnType<typeof followUpRows>>
const writtenSince = (earlier: Written, later: Written): Written => {
  const fresh = (key: keyof Written) => later[key].filter((row) => !earlier[key].some((old) => old.id === row.id))
  return { tasks: fresh('tasks'), notes: fresh('notes'), notices: fresh('notices') }
}

type QuoteOptions = { owner?: string | null; opportunity?: string | null }
type DecisionOptions = { by?: PortalMember; reason?: string | null; comments?: string | null; fields?: Record<string, unknown> }
type Decided = Written & { quote: Row; result: Row; response: Row }

const newQuote = ({ owner = fx.owner.teamMemberId, opportunity = null }: QuoteOptions = {}) =>
  fx.sentQuote({ owner_id: owner, opportunity_id: opportunity })

/** Decides a quote through a fresh link made by `by`, as the client does, and returns what the follow-ups wrote. */
const decideQuote = async (
  quoteId: string, decision: 'accepted' | 'declined', { by = fx.sender, reason = null, comments = null, fields = {} }: DecisionOptions = {},
): Promise<Decided> => {
  const link = await fx.newLink(quoteId, { by })
  const r = await ready(link.token)
  const earlier = await followUpRows()
  const result = await decide(decisionArgs(r, decision, { p_decline_reason: reason, p_decline_comments: comments, ...fields }))
  assert.equal(result.replay, false)
  const written = writtenSince(earlier, await followUpRows())
  const response = must(await admin.from('quote_responses').select('*').eq('link_id', link.id).single()) as Row
  return { ...written, quote: await quoteRow(quoteId), result, response }
}
const decideNew = async (decision: 'accepted' | 'declined', options: QuoteOptions & DecisionOptions = {}) =>
  decideQuote(await newQuote(options), decision, options)

const expectTask = (
  task: Row, d: Decided,
  expected: { action: string; reason: string | null; comments?: string | null; assignee: string | null; opportunity?: string | null; client?: string | null },
) => {
  const { action, reason, comments = null, assignee, opportunity = null, client = opportunity === null ? fx.clientId : null } = expected
  assert.deepEqual(pick(task, TASK_KEYS), {
    organization_id: fx.orgId,
    title: `Follow up: ${d.quote.client_name} declined quotation ${d.quote.quote_number}`,
    description: recoveryText(action, reason, comments),
    client_id: client, opportunity_id: opportunity, lead_id: null, project_id: null, onboarding_id: null,
    assignee_id: assignee, created_by: null, priority: 'Medium', status: 'Planned', completed_at: null, archived_at: null,
  })
  assert.equal(time(task.due_at), time(d.response.decided_at) + 3 * DAY, 'due three days after the decision')
}

test('the owner and the sender are each notified once; one person who is both gets one row', async () => {
  const both = await decideNew('accepted', { owner: fx.owner.teamMemberId, by: fx.sender })
  assert.deepEqual(recipients(both.notices), sorted(fx.owner.userId, fx.sender.userId), 'owner and sender, once each')

  const declined = await decideNew('declined', { owner: fx.owner.teamMemberId, by: fx.sender, reason: 'Other' })
  assert.deepEqual(recipients(declined.notices), sorted(fx.owner.userId, fx.sender.userId), 'a decline tells both too')

  const same = await decideNew('accepted', { owner: fx.owner.teamMemberId, by: fx.owner })
  assert.deepEqual(recipients(same.notices), [fx.owner.userId], 'the owner who sent the link is told once')
})

test("an owner without a login gets no notification but the sender does, and notify_email is still the owner's address", async () => {
  const d = await decideNew('accepted', { owner: fx.ownerWithoutLogin.teamMemberId, by: fx.sender })
  assert.equal(d.result.owner_name, 'Nora Nologin')
  assert.equal(d.result.notify_email, fx.ownerWithoutLogin.email, 'the owner hears by email')
  assert.deepEqual(recipients(d.notices), [fx.sender.userId], 'only the sender, who has a login, gets an in-app notice')
})

test('the notice names the client, the number, the signatory and, for a decline, the reason', async () => {
  const cases: Array<{ decision: 'accepted' | 'declined'; reason?: string | null; verb: string; body: string }> = [
    { decision: 'accepted', verb: 'accepted', body: 'Signed by Pat Client, Managing Director.' },
    { decision: 'declined', reason: 'Budget considerations', verb: 'declined', body: 'Pat Client, Managing Director. Reason: Budget considerations.' },
    { decision: 'declined', reason: null, verb: 'declined', body: 'Pat Client, Managing Director. Reason: none given.' },
  ]
  for (const { decision, reason = null, verb, body } of cases) {
    const d = await decideNew(decision, { owner: fx.owner.teamMemberId, by: fx.sender, reason })
    assert.equal(d.notices.length, 2)
    for (const notice of d.notices) {
      assert.deepEqual(pick(notice, NOTICE_KEYS), {
        organization_id: fx.orgId,
        title: `Portal Client ${verb} quotation ${d.quote.quote_number}`,
        body,
        category: 'Commercial',
        href: `/commercial/quotes/${d.quote.id}`,
        read_at: null,
      }, `${decision} ${reason ?? ''}`)
      assert.equal(time(notice.created_at), time(d.response.decided_at), 'written with the decision')
    }
  }
})

test('each of the five reasons that call for one creates a task with its recommended action, due in three days, assigned to the owner, else the sender', async () => {
  for (const [reason, action] of Object.entries(ACTIONS)) {
    const d = await decideNew('declined', { owner: fx.owner.teamMemberId, by: fx.sender, reason })
    assert.equal(d.tasks.length, 1, `${reason}: one task`)
    assert.deepEqual(d.notes, [], `${reason}: no note`)
    expectTask(d.tasks[0], d, { action, reason, assignee: fx.owner.teamMemberId })
    assert.ok(d.tasks[0].description.startsWith(action), `${reason}: the description starts with the recommended action`)
  }

  const unowned = await decideNew('declined', { owner: null, by: fx.sender, reason: 'Timing is not right' })
  assert.equal(unowned.tasks.length, 1)
  expectTask(unowned.tasks[0], unowned, { action: ACTIONS['Timing is not right'], reason: 'Timing is not right', assignee: fx.sender.teamMemberId })
})

test('an absent or archived owner falls back to the sender; an archived sender is neither told nor assigned', async () => {
  const cases: Array<{ label: string; owner: string | null; by: PortalMember; ownerName: string | null; notify: string | null; told: string[]; assignee: string | null }> = [
    { label: 'no owner, sent by the sender', owner: null, by: fx.sender, ownerName: null, notify: fx.sender.email, told: [fx.sender.userId], assignee: fx.sender.teamMemberId },
    { label: 'an archived owner with a login, sent by the sender', owner: archivedOwner.teamMemberId, by: fx.sender, ownerName: null, notify: fx.sender.email, told: [fx.sender.userId], assignee: fx.sender.teamMemberId },
    // The owner without a login is a team member, so the task is theirs; only the in-app notice needs a login.
    { label: 'an owner without a login, sent by the sender', owner: fx.ownerWithoutLogin.teamMemberId, by: fx.sender, ownerName: 'Nora Nologin', notify: fx.ownerWithoutLogin.email, told: [fx.sender.userId], assignee: fx.ownerWithoutLogin.teamMemberId },
    { label: 'the owner, sent by an archived member', owner: fx.owner.teamMemberId, by: archivedSender, ownerName: 'Olive Owner', notify: fx.owner.email, told: [fx.owner.userId], assignee: fx.owner.teamMemberId },
    { label: 'no owner, sent by an archived member', owner: null, by: archivedSender, ownerName: null, notify: null, told: [], assignee: null },
    { label: 'an archived owner, sent by an archived member', owner: archivedOwner.teamMemberId, by: archivedSender, ownerName: null, notify: null, told: [], assignee: null },
    { label: 'no owner, sent by a member without a profile', owner: null, by: noProfile, ownerName: null, notify: null, told: [noProfile.userId], assignee: null },
  ]
  for (const { label, owner, by, ownerName, notify, told, assignee } of cases) {
    const d = await decideNew('declined', { owner, by, reason: 'Timing is not right' })
    assert.equal(d.quote.owner_id, owner, `${label}: the quote's owner`)
    assert.equal(d.result.owner_name, ownerName, `${label}: owner_name`)
    assert.equal(d.result.notify_email, notify, `${label}: notify_email`)
    assert.deepEqual(recipients(d.notices), sorted(...told), `${label}: who is told in the app`)
    assert.equal(d.tasks.length, 1, `${label}: one task`)
    expectTask(d.tasks[0], d, { action: ACTIONS['Timing is not right'], reason: 'Timing is not right', assignee })
  }
})

test('Chose another provider creates no task and exactly one note', async () => {
  const comments = 'We went with a provider closer to home.\nThank you for your time.'
  const onOpportunity = await decideNew('declined', { opportunity: opportunityId, reason: 'Chose another provider', comments })
  assert.deepEqual(onOpportunity.tasks, [], 'no task')
  assert.equal(onOpportunity.notes.length, 1, 'one note')
  assert.deepEqual(pick(onOpportunity.notes[0], NOTE_KEYS), {
    organization_id: fx.orgId, kind: 'note',
    subject: `Portal Client declined quotation ${onOpportunity.quote.quote_number}`,
    body: recoveryText(ANOTHER_PROVIDER, 'Chose another provider', comments),
    details: { quote_id: onOpportunity.quote.id, response_id: onOpportunity.response.id },
    created_by: null, lead_id: null, client_id: null, opportunity_id: opportunityId, quote_id: null,
  })
  assert.equal(onOpportunity.notices.length, 2, 'the owner and the sender are still told')

  const onClient = await decideNew('declined', { reason: 'Chose another provider' })
  assert.deepEqual(onClient.tasks, [])
  assert.equal(onClient.notes.length, 1)
  assert.deepEqual(pick(onClient.notes[0], ['body', 'client_id', 'opportunity_id', 'quote_id']), {
    body: recoveryText(ANOTHER_PROVIDER, 'Chose another provider'), client_id: fx.clientId, opportunity_id: null, quote_id: null,
  }, 'without an opportunity the note goes on the client')
})

test('no reason creates the optional follow-up', async () => {
  const silent = await decideNew('declined', { reason: null })
  assert.equal(silent.tasks.length, 1)
  assert.deepEqual(silent.notes, [])
  expectTask(silent.tasks[0], silent, { action: COURTEOUS, reason: null, assignee: fx.owner.teamMemberId })
  assert.ok(silent.tasks[0].description.endsWith('Reason given: none given.'))

  const commentsOnly = await decideNew('declined', { reason: null, comments: 'Not this year.' })
  expectTask(commentsOnly.tasks[0], commentsOnly, { action: COURTEOUS, reason: null, comments: 'Not this year.', assignee: fx.owner.teamMemberId })
})

test('the task is attached to the opportunity when the quote has one, otherwise to the client', async () => {
  const withOpportunity = await decideNew('declined', { opportunity: opportunityId, reason: 'Internal approval pending' })
  expectTask(withOpportunity.tasks[0], withOpportunity, {
    action: ACTIONS['Internal approval pending'], reason: 'Internal approval pending', assignee: fx.owner.teamMemberId, opportunity: opportunityId, client: null,
  })

  const withClient = await decideNew('declined', { reason: 'Internal approval pending' })
  expectTask(withClient.tasks[0], withClient, {
    action: ACTIONS['Internal approval pending'], reason: 'Internal approval pending', assignee: fx.owner.teamMemberId, opportunity: null, client: fx.clientId,
  })
})

test('a quote whose client is gone and that has no opportunity gets an unattached task, and its note goes on the quote', async () => {
  // A quote cannot be sent without a client, but quotes.client_id is set null when the client is deleted.
  const departed = must(await admin.from('clients').insert({ organization_id: fx.orgId, name: 'Departed Client', status: 'Active' }).select('id').single()).id as string
  const forTask = await fx.sentQuote({ owner_id: fx.owner.teamMemberId, client_id: departed, client_name: 'Departed Client' })
  const forNote = await fx.sentQuote({ owner_id: fx.owner.teamMemberId, client_id: departed, client_name: 'Departed Client' })
  assert.equal((await admin.from('clients').delete().eq('id', departed)).error, null)
  for (const id of [forTask, forNote]) {
    const quote = await quoteRow(id)
    assert.deepEqual([quote.client_id, quote.opportunity_id, quote.client_name], [null, null, 'Departed Client'])
  }

  const task = await decideQuote(forTask, 'declined', { reason: 'Scope does not meet our requirements' })
  assert.equal(task.tasks.length, 1)
  expectTask(task.tasks[0], task, {
    action: ACTIONS['Scope does not meet our requirements'], reason: 'Scope does not meet our requirements', assignee: fx.owner.teamMemberId, opportunity: null, client: null,
  })
  assert.equal(task.tasks[0].title, `Follow up: Departed Client declined quotation ${task.quote.quote_number}`)

  const note = await decideQuote(forNote, 'declined', { reason: 'Chose another provider' })
  assert.deepEqual(note.tasks, [])
  assert.equal(note.notes.length, 1)
  assert.deepEqual(pick(note.notes[0], ['client_id', 'opportunity_id', 'quote_id']), { client_id: null, opportunity_id: null, quote_id: forNote })
})

test('an accepted decision creates no task', async () => {
  for (const opportunity of [opportunityId, null]) {
    const d = await decideNew('accepted', { opportunity })
    assert.deepEqual(d.tasks, [], 'no task')
    assert.deepEqual(d.notes, [], 'no note')
    assert.deepEqual(recipients(d.notices), sorted(fx.owner.userId, fx.sender.userId), 'notices only')
  }
})

test('two identical decisions at once create one set of notifications and one task', async () => {
  const quote = await newQuote({ opportunity: opportunityId })
  const r = await ready((await fx.newLink(quote)).token)
  const args = decisionArgs(r, 'declined', { p_decline_reason: 'Budget considerations' })
  const earlier = await followUpRows()

  const results = await Promise.all([decide(args), decide(args)])
  assert.deepEqual(results.map((result) => result.replay).sort(), [false, true], 'one recorded, one replayed')
  const written = writtenSince(earlier, await followUpRows())
  assert.deepEqual(recipients(written.notices), sorted(fx.owner.userId, fx.sender.userId), 'one notice each')
  assert.equal(written.tasks.length, 1, 'one task')
  assert.deepEqual(written.notes, [])
})

test('the opportunity stage and the client row are unchanged by a decline', async () => {
  const opportunityBefore = must(await admin.from('sales_opportunities').select('*').eq('id', opportunityId).single())
  const clientBefore = must(await admin.from('clients').select('*').eq('id', fx.clientId).single())

  for (const reason of ['Chose another provider', 'Budget considerations', null]) {
    await decideNew('declined', { opportunity: opportunityId, reason })
  }
  await decideNew('declined', { reason: 'Chose another provider' })

  const opportunityAfter = must(await admin.from('sales_opportunities').select('*').eq('id', opportunityId).single())
  assert.equal(opportunityAfter.stage, 'Proposal')
  assert.deepEqual(opportunityAfter, opportunityBefore, 'the opportunity row is unchanged')
  assert.deepEqual(must(await admin.from('clients').select('*').eq('id', fx.clientId).single()), clientBefore, 'the client row is unchanged')
})

test('hostile comments are stored verbatim in the task description', async () => {
  const name = "O'Brien <b>"
  const position = 'Director & "Chief" </td><script>alert(1)</script>'
  // Markup, a header injection on its own line, a right-to-left override, a tab and a quoted SQL fragment.
  const opening = '<img src=x onerror=alert(1)>\nBcc: x@y.test\n‮gnp.exe\tend \'); drop table public.tasks; --'
  const comments = opening + 'z'.repeat(2000 - opening.length)
  assert.equal(comments.length, 2000)

  const d = await decideNew('declined', {
    reason: 'Other', comments, fields: { p_signatory_name: name, p_signatory_position: position },
  })
  assert.equal(d.tasks.length, 1)
  expectTask(d.tasks[0], d, { action: COURTEOUS, reason: 'Other', comments, assignee: fx.owner.teamMemberId })
  assert.ok(d.tasks[0].description.endsWith(comments), 'the comments end the description exactly as given')
  for (const notice of d.notices) assert.equal(notice.body, `${name}, ${position}. Reason: Other.`, 'the notice carries the signatory as given')
})

test('the migration wraps each write group in an exception when others block that only warns', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261020104000_quote_portal_follow_ups.sql'), 'utf8')
  const header = sql.indexOf('create or replace function private.decision_follow_ups')
  assert.ok(header >= 0, 'the migration replaces decision_follow_ups')
  const open = sql.indexOf('$$', header) + 2
  const code = sql.slice(open, sql.indexOf('$$', open)).replace(/--[^\n]*/g, '')
  assert.doesNotMatch(sql, /function public\.portal_decide/, 'portal_decide is not touched')

  // Every handler only warns, naming the response and the error code: no signatory text, no error message, no re-raise.
  const handlers = [...code.matchAll(/\bexception\s+when\s+others\s+then\s+([\s\S]*?)\bend;/gi)].map((match) => match[1].trim())
  assert.ok(handlers.length >= 2, 'the notices and the recovery are guarded')
  for (const handler of handlers) assert.match(handler, /^raise warning '[^']*'(?:,\s*(?:p_response_id|sqlstate))*;(?:\s*return;)?$/i, handler)
  assert.doesNotMatch(code, /\braise\s+exception\b|\bsqlerrm\b/i)
  assert.doesNotMatch(code, /\bupdate\s+public\.|\bdelete\s+from\b/i, 'the follow-ups only add rows')

  // Each insert sits in a block of its own (not the function's body) whose next handler is that block's.
  const positions = (pattern: RegExp) => [...code.matchAll(pattern)].map((match) => match.index!)
  const begins = positions(/\bbegin\b/gi)
  const guards = positions(/\bexception\s+when\s+others\s+then\b/gi)
  const inserts = [...code.matchAll(/\binsert\s+into\s+public\.(\w+)/gi)]
  assert.deepEqual(inserts.map((match) => match[1]).sort(), ['activities', 'notifications', 'tasks'])
  for (const insert of inserts) {
    const at = insert.index!
    const opened = Math.max(...begins.filter((position) => position < at))
    const guard = Math.min(...guards.filter((position) => position > at))
    assert.ok(opened > begins[0], `${insert[1]}: inside a block of its own`)
    assert.ok(Number.isFinite(guard), `${insert[1]}: a handler follows`)
    assert.ok(!guards.some((position) => position > opened && position < at), `${insert[1]}: no handler between its begin and the insert`)
    assert.ok(!begins.some((position) => position > at && position < guard), `${insert[1]}: the handler that follows is its block's`)
  }
})
