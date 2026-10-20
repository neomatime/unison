import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import * as copy from '../../features/quote-portal/copy.ts'
import { maskEmail, normaliseDecisionInput, refusalMessage } from '../../features/quote-portal/decision.ts'
import { DECLINE_REASONS } from '../../lib/quote-portal/types.ts'
import type { DecideRefusal, IssueCodeRefusal } from '../../lib/quote-portal/types.ts'

// The decision input rules, the decision types and the client-facing words of the accept and decline flow. All pure.
// The rules here are the database's own (portal_decide in 20261020103000_quote_portal_decide.sql) plus the ones the
// database does not apply (bidi controls, the exact consent wording), so a valid form never meets a database refusal.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const list = (raw: string) => raw.split(',').map((value) => value.trim().replace(/^'|'$/g, ''))

// 43 base64url characters: the shape of a real link token. Not a real token.
const TOKEN = 'A'.repeat(20) + '-_' + 'b'.repeat(21)
const HASH = 'ab12'.repeat(16)

/** A form that is valid as an accept; each test changes what it is about. */
const accept = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  token: TOKEN,
  code: '123456',
  decision: 'accepted',
  signatoryName: 'Pat Client',
  signatoryPosition: 'Managing Director',
  signatoryOrganisation: 'Portal Client (Pty) Ltd',
  consentText: copy.CONSENT_ACCEPT,
  consent: true,
  snapshotHash: HASH,
  declineReason: null,
  declineComments: null,
  ...overrides,
})

/** A form that is valid as a decline. */
const decline = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
  accept({ decision: 'declined', consentText: copy.CONSENT_DECLINE, declineReason: 'Budget considerations', declineComments: 'Not this year.', ...overrides })

function valueOf(raw: Record<string, unknown>) {
  const result = normaliseDecisionInput(raw)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.ok ? result.value : assert.fail('unreachable')
}

function errorsOf(raw: Record<string, unknown>) {
  const result = normaliseDecisionInput(raw)
  assert.equal(result.ok, false, 'the form must be refused')
  return result.ok ? assert.fail('unreachable') : result.errors
}

// ---------------------------------------------------------------------------------------------------------------
// The vocabulary and the words
// ---------------------------------------------------------------------------------------------------------------

test('the decline reasons are the six in the Task 1 check, in its order, and the same six the decision function allows', () => {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  let inTable: string[] | null = null
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
    const match = readFileSync(join(directory, name), 'utf8').match(/decline_reason text check \(decline_reason in \(([^)]*)\)\)/)
    if (match) inTable = list(match[1])
  }
  assert.ok(inTable, 'the quote_responses decline_reason check must be found')
  assert.deepEqual([...DECLINE_REASONS], inTable)

  const decide = read('supabase', 'migrations', '20261020103000_quote_portal_decide.sql')
  const array = decide.match(/c_reasons constant text\[\] := array\[([^\]]*)\]/)
  assert.ok(array, 'portal_decide must list the reasons')
  assert.deepEqual([...DECLINE_REASONS], list(array![1].replace(/\s+/g, ' ')))
})

test('the strings the spec appendix gives are used verbatim', () => {
  const spec = read('docs', 'superpowers', 'specs', '2026-10-18-quote-portal-design.md')
  const appendix = spec.slice(spec.indexOf('## Appendix: client-facing copy')).replace(/\s+/g, ' ')
  assert.ok(appendix.length > 100, 'the appendix must be found')
  const quoted = (pattern: RegExp) => {
    const match = appendix.match(pattern)
    assert.ok(match, `the appendix must match ${pattern}`)
    return match!
  }

  assert.match(appendix, /buttons "Accept Quotation", "Decline Quotation", "Download PDF"/)
  assert.equal(copy.ACCEPT_QUOTATION, 'Accept Quotation')
  assert.equal(copy.DECLINE_QUOTATION, 'Decline Quotation')
  assert.equal(copy.CONSENT_ACCEPT, quoted(/Consent \(unchecked by default\): "([^"]+)"/)[1])
  assert.equal(copy.DECLINE_MESSAGE, quoted(/- Decline: "([^"]+)"/)[1])

  const codeEmail = quoted(/Code email, subject "([^"]+)": "([^"]+)"/)
  assert.equal(copy.CODE_EMAIL_SUBJECT, codeEmail[1])
  assert.equal(copy.codeEmailSentence('123456'), codeEmail[2], 'the appendix example uses the code 123456')

  const acknowledgement = quoted(/Client acknowledgement \(accepted\): "([^"]+)" \(declined\): "([^"]+)"/)
  assert.equal(copy.acknowledgementAccepted('{number}', '{date}', '{owner}'), acknowledgement[1])
  assert.equal(copy.acknowledgementDeclined('{number}'), acknowledgement[2])

  const owner = quoted(/Owner notification: "([^"]+)"/)[1]
  for (const decision of ['accepted', 'declined'] as const) {
    assert.equal(copy.ownerNoticeTitle('{client}', decision, '{number}'), owner.replace('{accepted|declined}', decision))
  }
})

test('the acceptance acknowledgement has a sentence for a quote with no owner, and the strings are plain text', () => {
  assert.equal(
    copy.acknowledgementAccepted('HMK-Q-2026-00046', '20 October 2026', null),
    'Thank you. We have recorded your acceptance of quotation HMK-Q-2026-00046 on 20 October 2026. Your HIMARK contact will be in touch about next steps.',
  )
  assert.equal(
    copy.acknowledgementAccepted('HMK-Q-2026-00046', '20 October 2026', 'Neo Matime'),
    'Thank you. We have recorded your acceptance of quotation HMK-Q-2026-00046 on 20 October 2026. Your HIMARK contact, Neo Matime, will be in touch about next steps.',
  )
})

test('the decline consent is the drafted sentence and both consent wordings fit the database bounds (20 to 500 characters)', () => {
  assert.equal(copy.CONSENT_DECLINE, 'I confirm that I am authorised to decline this quotation on behalf of the organisation.')
  assert.notEqual(copy.CONSENT_DECLINE, copy.CONSENT_ACCEPT)
  for (const text of [copy.CONSENT_ACCEPT, copy.CONSENT_DECLINE]) {
    const length = [...text].length
    assert.ok(length >= 20 && length <= 500, `${length} characters`)
  }
})

test('the drafted words are marked for the owner as drafted, and the pure modules take relative imports only', () => {
  const copySource = read('features', 'quote-portal', 'copy.ts')
  for (const name of ['CONSENT_DECLINE', 'STEP_LABELS', 'REFUSAL_MESSAGES', 'ALREADY_RESPONDED_NOTE']) {
    assert.match(copySource, new RegExp(`export const ${name}\\b`), `${name} is exported`)
  }
  assert.match(copySource, /DRAFTED for the owner's approval/, 'the drafted group is marked')

  for (const file of [['features', 'quote-portal', 'decision.ts'], ['features', 'quote-portal', 'copy.ts'], ['lib', 'quote-portal', 'types.ts']]) {
    const source = read(...file)
    assert.doesNotMatch(source, /from ['"]@\//, `${file.join('/')} has no @/ import`)
    assert.doesNotMatch(source, /server-only|['"]use (server|client)['"]/, `${file.join('/')} has no directive`)
    assert.doesNotMatch(source, /supabase\/admin/, `${file.join('/')} does not touch the service role`)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// normaliseDecisionInput: the whole form
// ---------------------------------------------------------------------------------------------------------------

test('a valid accept gives the typed input, with exactly the DecideInput keys', () => {
  assert.deepEqual(valueOf(accept()), {
    token: TOKEN,
    code: '123456',
    decision: 'accepted',
    signatoryName: 'Pat Client',
    signatoryPosition: 'Managing Director',
    signatoryOrganisation: 'Portal Client (Pty) Ltd',
    consentText: copy.CONSENT_ACCEPT,
    consent: true,
    snapshotHash: HASH,
    declineReason: null,
    declineComments: null,
  })
})

test('a valid decline keeps its reason and comments, and the decline wording', () => {
  const value = valueOf(decline({ declineComments: 'Not this year.\nPlease ask again in March.' }))
  assert.equal(value.decision, 'declined')
  assert.equal(value.consentText, copy.CONSENT_DECLINE)
  assert.equal(value.declineReason, 'Budget considerations')
  assert.equal(value.declineComments, 'Not this year.\nPlease ask again in March.')
})

test('a decline needs neither a reason nor comments, and empty ones become null', () => {
  for (const empty of [null, undefined, '', '   ', '\n\t \n']) {
    const value = valueOf(decline({ declineReason: empty, declineComments: empty }))
    assert.equal(value.declineReason, null, JSON.stringify(empty))
    assert.equal(value.declineComments, null, JSON.stringify(empty))
  }
})

test('every field is checked in one pass and each error is the drafted message for its field', () => {
  const errors = errorsOf({})
  assert.deepEqual(Object.keys(errors).sort(), ['code', 'consent', 'decision', 'name', 'organisation', 'position', 'snapshot', 'token'])
  for (const [key, message] of Object.entries(errors)) {
    assert.equal(message, copy.FIELD_ERRORS[key as keyof typeof copy.FIELD_ERRORS], key)
    assert.ok(message.length > 0, key)
  }
  assert.deepEqual(Object.keys(errorsOf(accept({ signatoryName: '', code: 'abc' }))).sort(), ['code', 'name'])
})

test('no error message repeats what was typed', () => {
  const hostile = '<img src=x onerror=alert(1)>\r\nBcc: evil@x.test'
  const errors = errorsOf(accept({ signatoryName: hostile, signatoryPosition: hostile, signatoryOrganisation: hostile, code: hostile, declineComments: hostile }))
  for (const message of Object.values(errors)) {
    assert.doesNotMatch(message, /img|Bcc|evil/)
  }
})

test('input that is not an object, or has the wrong types, is refused and never throws', () => {
  for (const raw of [null, undefined, 'a string', 42, []] as unknown as Record<string, unknown>[]) {
    assert.equal(normaliseDecisionInput(raw).ok, false, JSON.stringify(raw))
  }
  const errors = errorsOf(
    accept({ token: 42, code: 123456, signatoryName: 7, signatoryPosition: {}, signatoryOrganisation: ['x'], snapshotHash: 1, decision: 1, consent: 'true', declineReason: 5, declineComments: 5 }),
  )
  assert.deepEqual(Object.keys(errors).sort(), ['code', 'comments', 'consent', 'decision', 'name', 'organisation', 'position', 'reason', 'snapshot', 'token'])
})

// ---------------------------------------------------------------------------------------------------------------
// token, decision, code, snapshot hash
// ---------------------------------------------------------------------------------------------------------------

test('the token must be a 43-character link token, exactly', () => {
  assert.deepEqual(Object.keys(errorsOf(accept({ token: TOKEN.slice(1) }))), ['token'])
  assert.deepEqual(Object.keys(errorsOf(accept({ token: TOKEN + 'A' }))), ['token'])
  assert.deepEqual(Object.keys(errorsOf(accept({ token: ` ${TOKEN}` }))), ['token'])
  assert.deepEqual(Object.keys(errorsOf(accept({ token: TOKEN.slice(1) + '=' }))), ['token'])
  assert.deepEqual(Object.keys(errorsOf(accept({ token: '' }))), ['token'])
  assert.deepEqual(Object.keys(errorsOf(accept({ token: undefined }))), ['token'])
})

test('the decision must be accepted or declined, exactly', () => {
  for (const decision of ['ACCEPTED', 'accept', 'Accepted', ' accepted', 'approved', '', null, undefined]) {
    assert.deepEqual(Object.keys(errorsOf(accept({ decision }))), ['decision'], JSON.stringify(decision))
  }
})

test('the code is six digits: trimmed, but never reshaped', () => {
  assert.equal(valueOf(accept({ code: ' 123456 ' })).code, '123456')
  assert.equal(valueOf(accept({ code: '000000' })).code, '000000')
  for (const code of ['12 34 56', '12345', '1234567', 'abcdef', '12345a', '12-345', '１２３４５６', '', '   ', null, undefined, 123456]) {
    assert.deepEqual(Object.keys(errorsOf(accept({ code }))), ['code'], JSON.stringify(code))
  }
})

test('the snapshot hash is 64 lower-case hex characters, exactly', () => {
  assert.equal(valueOf(accept({ snapshotHash: HASH })).snapshotHash, HASH)
  for (const snapshotHash of [HASH.toUpperCase(), HASH.slice(1), HASH + 'a', `${HASH.slice(1)}g`, ` ${HASH}`, '', null, undefined]) {
    assert.deepEqual(Object.keys(errorsOf(accept({ snapshotHash }))), ['snapshot'], JSON.stringify(snapshotHash))
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The single-line fields: name, position, organisation
// ---------------------------------------------------------------------------------------------------------------

const SINGLE_LINE = [
  { field: 'signatoryName', key: 'name', max: 120 },
  { field: 'signatoryPosition', key: 'position', max: 120 },
  { field: 'signatoryOrganisation', key: 'organisation', max: 160 },
] as const

for (const { field, key, max } of SINGLE_LINE) {
  test(`${field}: trimmed, whitespace runs collapsed, 2 to ${max} characters (the database's own bounds)`, () => {
    const value = (text: unknown) => valueOf(accept({ [field]: text }))[field]
    assert.equal(value('  Pat   Client  '), 'Pat Client')
    assert.equal(value('Pat  Client'), 'Pat Client', 'a no-break space is whitespace too')
    assert.equal(value('Jo'), 'Jo')
    assert.equal(value('x'.repeat(max)), 'x'.repeat(max))
    assert.equal(value('\u{1F600}'.repeat(max)), '\u{1F600}'.repeat(max), 'the length is in characters, as the database counts it, not UTF-16 units')

    for (const bad of [undefined, null, '', '   ', 'A', ' A ', 'x'.repeat(max + 1), '\u{1F600}'.repeat(max + 1), 42]) {
      assert.deepEqual(Object.keys(errorsOf(accept({ [field]: bad }))), [key], JSON.stringify(bad))
    }
  })

  test(`${field}: a line break, tab, other control character, bidi control or lone surrogate is refused, wherever it sits`, () => {
    const hostile = [
      'Pat\nClient',
      'Pat\rClient',
      'Pat\r\nBcc: x@y.test',
      'Pat Client\r\nBcc: x@y.test',
      'Pat\tClient',
      '\tPat Client',
      'Pat Client\n',
      'Pat\u0000Client',
      'Pat\u0007Client',
      'Pat\u007fClient',
      'Pat\u0085Client',
      'Pat\u200eClient',
      'Pat\u200fClient',
      'Pat\u202eClient',
      'Pat \u202aClient',
      'Pat \u202bClient',
      'Pat \u202cClient',
      'Pat \u202dClient',
      'Pat \u2066Client',
      'Pat \u2067Client',
      'Pat \u2068Client',
      'Pat \u2069Client',
      'Pat \ud800 Client',
    ]
    for (const text of hostile) {
      assert.deepEqual(Object.keys(errorsOf(accept({ [field]: text }))), [key], JSON.stringify(text))
    }
  })

  test(`${field}: markup is not this layer's business (it is escaped where it is shown), and ordinary punctuation passes`, () => {
    assert.equal(valueOf(accept({ [field]: "O'Brien & Sons <Pty> \"Ltd\"" }))[field], "O'Brien & Sons <Pty> \"Ltd\"")
    assert.equal(valueOf(accept({ [field]: 'Nomvula Mokoena-Dlamini' }))[field], 'Nomvula Mokoena-Dlamini')
    assert.equal(valueOf(accept({ [field]: 'Zoë Müller' }))[field], 'Zoë Müller')
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------------------------

test('comments: \\r\\n becomes \\n, tabs and newlines inside are kept, the ends are trimmed', () => {
  assert.equal(valueOf(decline({ declineComments: 'Line one\r\nLine two\r\n\r\nLine four' })).declineComments, 'Line one\nLine two\n\nLine four')
  assert.equal(valueOf(decline({ declineComments: 'Item\tprice\nA\t10' })).declineComments, 'Item\tprice\nA\t10')
  assert.equal(valueOf(decline({ declineComments: '  \n spaced out \n  ' })).declineComments, 'spaced out')
})

test('comments: at most 2000 characters, counted after \\r\\n has become \\n and as the database counts them', () => {
  assert.equal(valueOf(decline({ declineComments: 'x'.repeat(2000) })).declineComments, 'x'.repeat(2000))
  assert.equal(valueOf(decline({ declineComments: '\u{1F600}'.repeat(2000) })).declineComments, '\u{1F600}'.repeat(2000))
  assert.equal(valueOf(decline({ declineComments: 'x\r\n'.repeat(999) + 'x' })).declineComments?.length, 1999)
  assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: 'x'.repeat(2001) }))), ['comments'])
  assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: '\u{1F600}'.repeat(2001) }))), ['comments'])
  assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: 'x'.repeat(10_000) }))), ['comments'])
})

test('comments: a null byte, any other control character, a lone carriage return, a bidi control or a lone surrogate is refused', () => {
  const hostile = [
    'before\u0000after',
    'a\u0007b',
    'a\u001bb',
    'a\u007fb',
    'a\u0085b',
    'a\u000bb',
    'a\u000cb',
    'old\rMac line break',
    'a\u200eb',
    'a\u200fb',
    'a\u202ab',
    'a\u202bb',
    'a\u202cb',
    'a\u202db',
    'a\u202eb',
    'a\u2066b',
    'a\u2067b',
    'a\u2068b',
    'a\u2069b',
    'a\udc00b',
  ]
  for (const text of hostile) {
    assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: text }))), ['comments'], JSON.stringify(text))
  }
})

test('comments: the Unicode line and paragraph separators become newlines, so no locale can make the database refuse them', () => {
  // glibc classes U+2028 and U+2029 as control characters, and portal_decide refuses a control character other than \n and \t.
  for (const [name, separator] of [['U+2028 line separator', '\u2028'], ['U+2029 paragraph separator', '\u2029']] as const) {
    const folded = valueOf(decline({ declineComments: `Line one${separator}Line two` })).declineComments
    assert.equal(folded, 'Line one\nLine two', name)
    assert.doesNotMatch(folded ?? '', /[\u2028\u2029]/, name)
    assert.equal(valueOf(decline({ declineComments: `${separator}  spaced${separator}${separator}out ${separator}` })).declineComments, 'spaced\n\nout', `${name} at the ends and doubled`)
    assert.equal(valueOf(decline({ declineComments: `${separator}${separator}` })).declineComments, null, `${name} alone is empty`)
    assert.equal(valueOf(decline({ declineComments: `a\r\nb${separator}c` })).declineComments, 'a\nb\nc', `${name} beside \\r\\n`)
    // Still one character each: the 2000 limit is the same before and after the fold.
    assert.equal(valueOf(decline({ declineComments: 'x' + separator + 'y'.repeat(1998) })).declineComments?.length, 2000, name)
    assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: 'x' + separator + 'y'.repeat(1999) }))), ['comments'], `${name} counts as one character`)
  }
  // A separator beside a lone carriage return does not hide it: the lone \r is still refused.
  assert.deepEqual(Object.keys(errorsOf(decline({ declineComments: 'a\r\u2028b' }))), ['comments'])
})

test('the single-line fields still collapse the Unicode line and paragraph separators to one space', () => {
  for (const { field } of SINGLE_LINE) {
    for (const separator of ['\u2028', '\u2029']) {
      assert.equal(valueOf(accept({ [field]: `Pat${separator}Client` }))[field], 'Pat Client', field)
      assert.equal(valueOf(accept({ [field]: `${separator}Pat ${separator}${separator} Client${separator}` }))[field], 'Pat Client', field)
    }
  }
})

test('comments are for a decline only: on an accept they are refused, as the database refuses them', () => {
  assert.deepEqual(Object.keys(errorsOf(accept({ declineComments: 'Looks good.' }))), ['comments'])
  assert.equal(valueOf(accept({ declineComments: '  ' })).declineComments, null, 'empty is not "given"')
})

// ---------------------------------------------------------------------------------------------------------------
// Reason
// ---------------------------------------------------------------------------------------------------------------

test('a reason is one of the six, exactly, and only on a decline', () => {
  for (const reason of DECLINE_REASONS) {
    assert.equal(valueOf(decline({ declineReason: reason })).declineReason, reason)
  }
  assert.equal(valueOf(decline({ declineReason: '  Other ' })).declineReason, 'Other', 'trimmed')
  for (const reason of ['budget considerations', 'Budget', 'Price', 'Other.', 'OTHER', 'Budget  considerations', 5, {}]) {
    assert.deepEqual(Object.keys(errorsOf(decline({ declineReason: reason }))), ['reason'], JSON.stringify(reason))
  }
})

test('a reason on an accept is an error, even a listed one', () => {
  assert.deepEqual(Object.keys(errorsOf(accept({ declineReason: 'Budget considerations' }))), ['reason'])
  assert.deepEqual(Object.keys(errorsOf(accept({ declineReason: 'Because' }))), ['reason'])
  assert.equal(valueOf(accept({ declineReason: '' })).declineReason, null, 'an empty reason is no reason')
})

// ---------------------------------------------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------------------------------------------

test('consent must be true, and the wording must be the one for the decision, exactly', () => {
  for (const consent of [false, undefined, null, 'true', 1, 'on', [true]]) {
    assert.deepEqual(Object.keys(errorsOf(accept({ consent }))), ['consent'], JSON.stringify(consent))
  }
  const missing = accept()
  delete missing.consent
  assert.deepEqual(Object.keys(errorsOf(missing)), ['consent'])

  // A changed sentence: a word, a trailing space, a missing full stop, a different case, nothing, the other decision's.
  for (const consentText of [
    copy.CONSENT_ACCEPT.replace('authorised', 'authorized'),
    `${copy.CONSENT_ACCEPT} `,
    copy.CONSENT_ACCEPT.slice(0, -1),
    copy.CONSENT_ACCEPT.toUpperCase(),
    copy.CONSENT_ACCEPT.replace('accept', 'decline'),
    '',
    undefined,
    null,
    copy.CONSENT_DECLINE,
  ]) {
    assert.deepEqual(Object.keys(errorsOf(accept({ consentText }))), ['consent'], JSON.stringify(consentText))
  }
  for (const consentText of [copy.CONSENT_ACCEPT, `${copy.CONSENT_DECLINE} `, copy.CONSENT_DECLINE.slice(0, -1)]) {
    assert.deepEqual(Object.keys(errorsOf(decline({ consentText }))), ['consent'], JSON.stringify(consentText))
  }
})

test('with no valid decision the wording cannot be judged, so only the decision is reported for it', () => {
  assert.deepEqual(Object.keys(errorsOf(accept({ decision: 'maybe' }))), ['decision'])
})

// ---------------------------------------------------------------------------------------------------------------
// maskEmail
// ---------------------------------------------------------------------------------------------------------------

test('maskEmail keeps the first character of the local part and the whole domain', () => {
  assert.equal(maskEmail('jane@acme.co.za'), 'j***@acme.co.za')
  assert.equal(maskEmail('jane.doe+quotes@acme.co.za'), 'j***@acme.co.za', 'the mask does not depend on the length of the local part')
})

test('maskEmail on a one-letter local part, an address with no @ and odd input', () => {
  assert.equal(maskEmail('j@acme.co.za'), 'j***@acme.co.za')
  assert.equal(maskEmail('no-at-sign'), '***')
  assert.equal(maskEmail(''), '***')
  assert.equal(maskEmail('@acme.co.za'), '***@acme.co.za')
  assert.equal(maskEmail('\u{1F600}jane@acme.co.za'), '\u{1F600}***@acme.co.za', 'a character, not half of one')
})

// ---------------------------------------------------------------------------------------------------------------
// refusalMessage
// ---------------------------------------------------------------------------------------------------------------

const DECIDE_REASONS: DecideRefusal[] = ['invalid', 'not_open', 'incomplete', 'stale', 'code_missing', 'code_wrong', 'code_expired', 'code_locked', 'throttled']
const ISSUE_REASONS: IssueCodeRefusal[] = ['invalid', 'not_open', 'already_decided', 'throttled']
const ALL_REASONS = [...new Set([...DECIDE_REASONS, ...ISSUE_REASONS, 'send_failed' as const])]

test('every refusal has its own non-empty message', () => {
  const messages = ALL_REASONS.map((reason) => refusalMessage(reason, reason === 'code_wrong' ? 3 : undefined))
  for (const [index, message] of messages.entries()) {
    assert.equal(typeof message, 'string')
    assert.ok(message.trim().length > 0, ALL_REASONS[index])
  }
  assert.equal(new Set(messages).size, ALL_REASONS.length, 'no two reasons share a message')
  assert.equal(ALL_REASONS.length, 11)
})

test('a wrong code says how many attempts are left, in the singular and the plural', () => {
  assert.match(refusalMessage('code_wrong', 4), /\b4 attempts\b/)
  assert.match(refusalMessage('code_wrong', 2), /\b2 attempts\b/)
  assert.match(refusalMessage('code_wrong', 1), /\b1 attempt\b(?!s)/)
  assert.doesNotMatch(refusalMessage('code_wrong', 1), /attempts/)
  assert.notEqual(refusalMessage('code_wrong', 4), refusalMessage('code_wrong', 2))
})

test('a wrong code with no attempts left, or with no count, still gives a sensible message', () => {
  const none = refusalMessage('code_wrong', 0)
  assert.match(none, /no attempts left/i)
  assert.match(none, /new code/i)
  for (const unknown of [undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const message = refusalMessage('code_wrong', unknown)
    assert.ok(message.trim().length > 0)
    assert.doesNotMatch(message, /NaN|Infinity|undefined|-1|1\.5/, String(unknown))
  }
  assert.notEqual(refusalMessage('code_wrong'), refusalMessage('code_expired'))
})

test('the attempts left matter to a wrong code only', () => {
  for (const reason of ALL_REASONS.filter((reason) => reason !== 'code_wrong')) {
    assert.equal(refusalMessage(reason, 3), refusalMessage(reason), reason)
  }
})

test('refusal messages tell the client what to do and never name the machinery', () => {
  for (const reason of ALL_REASONS) {
    const message = refusalMessage(reason, 2)
    assert.doesNotMatch(message, /database|supabase|sql|rpc|function|hash|salt|token|exception|stack|undefined|null/i, reason)
    assert.doesNotMatch(message, /[<>{}]/, reason)
    assert.match(message, /[.!]$/, `${reason} is a finished sentence`)
  }
  assert.match(refusalMessage('code_expired'), /new/i, 'an expired code points to a new one')
  assert.match(refusalMessage('code_locked'), /new/i, 'a locked code points to a new one')
  assert.match(refusalMessage('stale'), /refresh/i, 'a changed quotation points to a refresh')
})

test('a reason this layer does not know gets a generic message, never a crash or an object property', () => {
  const generic = refusalMessage('something_new' as DecideRefusal)
  assert.ok(generic.trim().length > 0)
  assert.equal(new Set([...ALL_REASONS.map((reason) => refusalMessage(reason, 2)), generic]).size, ALL_REASONS.length + 1)
  for (const odd of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(refusalMessage(odd as DecideRefusal), generic, odd)
  }
})

test('the drafted words other than the refusals are present', () => {
  assert.ok(copy.ALREADY_RESPONDED_NOTE.trim().length > 0)
  assert.ok(Object.keys(copy.STEP_LABELS).length >= 3)
  for (const label of Object.values(copy.STEP_LABELS)) assert.ok(label.trim().length > 0)
})
