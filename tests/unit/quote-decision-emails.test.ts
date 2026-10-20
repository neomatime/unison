import assert from 'node:assert/strict'
import test from 'node:test'
import {
  quoteAcknowledgementEmailTemplate,
  quoteCodeEmailTemplate,
  quoteOwnerNoticeEmailTemplate,
} from '../../lib/email/templates/quote-decision.ts'
import { escapeHtml } from '../../lib/email/templates/safe.ts'

// These tests prove STRUCTURE and ESCAPING only: that the markup is safe, that the words are the appendix's, and that no
// client-supplied value can reach a header or break out of the document. They cannot show how a mail client draws it.

const QUOTE_URL = 'https://unison.example/documents/7f1c2a'
const NAVY = '#0d2340'

const IMG = '<img src=x onerror=alert(1)>'
const SCRIPT = '<script>alert(1)</script>'
const CRLF = '"\r\nBcc: evil@x.test"'
const BIDI = '\u202e'

type CodeData = Parameters<typeof quoteCodeEmailTemplate>[0]
type AckData = Parameters<typeof quoteAcknowledgementEmailTemplate>[0]
type NoticeData = Parameters<typeof quoteOwnerNoticeEmailTemplate>[0]

const code = (overrides: Partial<CodeData> = {}) =>
  quoteCodeEmailTemplate({ code: '482913', quoteNumber: 'HMK-Q-2026-00001', clientName: 'Acme Holdings', ...overrides })

const ack = (overrides: Partial<AckData> = {}) =>
  quoteAcknowledgementEmailTemplate({
    decision: 'accepted',
    quoteNumber: 'HMK-Q-2026-00001',
    decidedOn: '20 October 2026',
    ownerName: 'Neo Matime',
    signatoryName: 'Thandi Nkosi',
    ...overrides,
  })

const notice = (overrides: Partial<NoticeData> = {}) =>
  quoteOwnerNoticeEmailTemplate({
    decision: 'accepted',
    clientName: 'Acme Holdings',
    quoteNumber: 'HMK-Q-2026-00001',
    signatoryName: 'Thandi Nkosi',
    signatoryPosition: 'Chief Executive Officer',
    declineReason: null,
    declineComments: null,
    quoteUrl: QUOTE_URL,
    ...overrides,
  })

const declined = (overrides: Partial<NoticeData> = {}) =>
  notice({ decision: 'declined', declineReason: 'Budget considerations', declineComments: 'Not this year.', ...overrides })

const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
const anchors = (html: string) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: attr(`<a${m[1]}>`, 'href'), inner: m[2] }))
const plain = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/** One of each template, for the checks that hold for all of them. */
function everyTemplate() {
  return [
    ['code email', code()],
    ['accepted acknowledgement', ack()],
    ['declined acknowledgement', ack({ decision: 'declined' })],
    ['accepted notice', notice()],
    ['declined notice', declined()],
  ] as const
}

// ---------------------------------------------------------------------------------------------------------------
// The confirmation code email
// ---------------------------------------------------------------------------------------------------------------

test('the code email has the appendix subject and the appendix sentence, with the code large in a monospaced block', () => {
  const mail = code()
  assert.equal(mail.subject, 'Your HIMARK confirmation code')
  const sentence =
    'Your confirmation code is 482913. It expires in 10 minutes. If you did not ask for this code, you can ignore this email; nothing has been accepted or declined.'
  assert.ok(plain(mail.html).includes(sentence), 'the sentence in the html')
  assert.ok(mail.text.includes(sentence), 'the sentence in the text')
  const block = mail.html.match(/<td\b[^>]*monospace[^>]*>\s*482913\s*<\/td>/i)
  assert.ok(block, 'the code alone in a monospaced cell')
  const fontSize = Number(block[0].match(/font-size:(\d+)px/)?.[1])
  assert.ok(fontSize >= 28, `the code is large (${fontSize}px)`)
})

test('the code email links nowhere: no anchor and no address, in the html or the text', () => {
  const mail = code()
  assert.equal(anchors(mail.html).length, 0)
  assert.ok(!/<a\b/i.test(mail.html))
  assert.ok(!/https?:|www\./i.test(mail.html), 'no URL in the html')
  assert.ok(!/https?:|www\./i.test(mail.text), 'no URL in the text')
})

test('the code email names the quotation and the client when it has them, and copes without a client', () => {
  const mail = code()
  assert.ok(mail.text.includes('Quote number: HMK-Q-2026-00001'))
  assert.ok(mail.text.includes('Client: Acme Holdings'))
  const without = code({ clientName: null })
  assert.ok(!/Client:/.test(without.text) && !/null/.test(without.html))
  assert.ok(without.text.includes('HMK-Q-2026-00001'))
  assert.ok(!/Client:/.test(code({ clientName: '   ' }).text), 'a blank client name is left out')
})

test('a code that is not exactly six digits is refused, and the error does not carry it', () => {
  const bad = [
    '', '1', '12345', '1234567', '12345a', 'abcdef', ' 482913', '482913 ', '482913\n', '\n482913', '482 913', '-48291', '48291.', '4829137',
    '\uff14\uff18\uff12\uff19\uff11\uff13', // full-width digits
    '\u0664\u0668\u0662\u0669\u0661\u0663', // Arabic-Indic digits
  ]
  for (const value of bad) {
    // The message says what is wrong in words: it holds no digit at all, so it cannot hold the code.
    assert.throws(() => code({ code: value }), (error: Error) => error instanceof Error && /code/.test(error.message) && !/\d/.test(error.message), JSON.stringify(value))
  }
  for (const value of [null, undefined, 482913, ['482913'], { toString: () => '482913' }]) {
    assert.throws(() => code({ code: value as never }), `non-string ${String(value)}`)
  }
  for (const good of ['000000', '999999', '012345']) assert.equal(code({ code: good }).subject, 'Your HIMARK confirmation code')
})

// ---------------------------------------------------------------------------------------------------------------
// The client's acknowledgement
// ---------------------------------------------------------------------------------------------------------------

test('the accepted acknowledgement: subject, greeting by the signatory, and the appendix sentence', () => {
  const mail = ack()
  assert.equal(mail.subject, 'Your response to quotation HMK-Q-2026-00001')
  const sentence =
    'Thank you. We have recorded your acceptance of quotation HMK-Q-2026-00001 on 20 October 2026. Your HIMARK contact, Neo Matime, will be in touch about next steps.'
  assert.ok(plain(mail.html).includes(sentence), 'html')
  assert.ok(mail.text.includes(sentence), 'text')
  assert.ok(plain(mail.html).includes('Hello Thandi Nkosi,'), 'the greeting in the html')
  assert.ok(mail.text.includes('Hello Thandi Nkosi,'), 'the greeting in the text')
})

test('the declined acknowledgement: the appendix sentence, and no date and no owner', () => {
  const mail = ack({ decision: 'declined' })
  assert.equal(mail.subject, 'Your response to quotation HMK-Q-2026-00001')
  const sentence = 'Thank you for letting us know. We have recorded your response to quotation HMK-Q-2026-00001.'
  assert.ok(plain(mail.html).includes(sentence), 'html')
  assert.ok(mail.text.includes(sentence), 'text')
  assert.ok(!mail.text.includes('acceptance') && !mail.text.includes('20 October 2026') && !mail.text.includes('Neo Matime'))
  assert.ok(mail.text.includes('Hello Thandi Nkosi,'))
})

test('an accepted quote with no owner drops the name and keeps the sentence whole', () => {
  const mail = ack({ ownerName: null })
  const sentence = 'Thank you. We have recorded your acceptance of quotation HMK-Q-2026-00001 on 20 October 2026. Your HIMARK contact will be in touch about next steps.'
  assert.ok(mail.text.includes(sentence))
  assert.ok(plain(mail.html).includes(sentence))
  assert.ok(!/,\s*,|null|undefined/.test(mail.text + mail.html))
})

test('the acknowledgement carries no link', () => {
  for (const mail of [ack(), ack({ decision: 'declined' })]) {
    assert.ok(!/<a\b/i.test(mail.html))
    assert.ok(!/https?:/i.test(mail.html + mail.text))
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The owner's notice
// ---------------------------------------------------------------------------------------------------------------

test('the owner notice subjects are "<client> accepted|declined quotation <number>"', () => {
  assert.equal(notice().subject, 'Acme Holdings accepted quotation HMK-Q-2026-00001')
  assert.equal(declined().subject, 'Acme Holdings declined quotation HMK-Q-2026-00001')
})

test('the notice names the client, quotation, signatory and position, and links to the quote', () => {
  const mail = notice()
  const text = plain(mail.html)
  for (const part of ['Acme Holdings accepted quotation HMK-Q-2026-00001', 'Thandi Nkosi', 'Chief Executive Officer', 'HMK-Q-2026-00001']) {
    assert.ok(text.includes(part), `html has ${part}`)
  }
  for (const part of ['Client: Acme Holdings', 'Quotation: HMK-Q-2026-00001', 'Signed by: Thandi Nkosi', 'Position: Chief Executive Officer']) {
    assert.ok(mail.text.includes(part), `text has ${part}`)
  }
  const link = anchors(mail.html).find((a) => a.href === QUOTE_URL)
  assert.ok(link && plain(link.inner).includes('OPEN QUOTATION'), 'a button to the quote')
  assert.ok(mail.text.includes(QUOTE_URL), 'and the address in the text')
  assert.equal(anchors(mail.html).length, 1, 'the one link')
  const cell = mail.html.match(/<td\b[^>]*>\s*<a\b[^>]*href="https:\/\/unison\.example[^"]*"[^>]*>/i)
  assert.ok(cell && cell[0].includes(`bgcolor="${NAVY}"`) && /display:inline-block/.test(cell[0]), 'a bulletproof button: a navy table cell holding a padded block-level link')
})

test('a declined notice shows the reason and the comments, with their line breaks', () => {
  const mail = declined({ declineReason: 'Timing is not right', declineComments: 'First line\nSecond line\r\n\r\nNew paragraph' })
  const text = plain(mail.html)
  assert.ok(text.includes('Timing is not right'), 'reason in the html')
  assert.ok(mail.html.includes('First line<br>Second line<br><br>New paragraph'), 'comments keep their line breaks in the html')
  assert.ok(!mail.html.includes('\r'), 'no carriage return in the html')
  assert.ok(mail.text.includes('Reason: Timing is not right'))
  for (const row of ['> First line', '> Second line', '> New paragraph']) assert.ok(mail.text.includes(row), `text has ${row}`)
  assert.ok(!mail.text.includes('\r'))
})

test('a declined notice with no reason and no comments says neither', () => {
  const mail = declined({ declineReason: null, declineComments: null })
  assert.ok(!/Reason/i.test(mail.text) && !/Comments/i.test(mail.text))
  assert.ok(!/REASON|COMMENTS/.test(plain(mail.html)))
  assert.ok(!/null|undefined/.test(mail.html + mail.text))
  const onlyReason = declined({ declineReason: 'Other', declineComments: '  \n ' })
  assert.ok(onlyReason.text.includes('Reason: Other') && !/Comments/i.test(onlyReason.text), 'blank comments are left out')
})

test('an accepted notice shows no decline details even if it is handed some', () => {
  const mail = notice({ declineReason: 'Budget considerations', declineComments: 'Not this year.' })
  assert.ok(!mail.html.includes('Budget considerations') && !mail.text.includes('Budget considerations'))
  assert.ok(!mail.html.includes('Not this year.') && !mail.text.includes('Not this year.'))
})

test('comments cannot pass for part of the email: every line of them is quoted in the text', () => {
  const fake = 'Signed by: The Chairman\nhttps://evil.example/phish\n\nKind regards,\nHIMARK'
  const mail = declined({ declineComments: fake })
  const lines = mail.text.split('\n')
  for (const row of ['Signed by: The Chairman', 'https://evil.example/phish', 'Kind regards,', 'HIMARK']) {
    assert.ok(!lines.includes(row), `"${row}" is never a line of its own`)
    assert.ok(lines.includes(`> ${row}`), `"${row}" is quoted`)
  }
  assert.equal(lines.filter((l) => l.startsWith('Signed by:')).length, 1, 'only the real signatory line')
  assert.equal(lines.filter((l) => l === 'Open the quotation:').length, 1)
  assert.equal(lines[lines.indexOf('Open the quotation:') + 1], QUOTE_URL, 'and the real address follows it')
  assert.ok(!/<a\b[^>]*evil/i.test(mail.html), 'and the html makes no link of it')
})

test('comments of 5,000 characters are cut to 2,000 and the cut is stated, in the html and the text', () => {
  const comments = `${'A&B<'.repeat(500)}${'tail'.repeat(750)}`
  assert.equal(comments.length, 5000)
  const mail = declined({ declineComments: comments })
  assert.ok(mail.html.includes('A&amp;B&lt;'.repeat(500)), 'the first 2,000 characters are there, escaped')
  assert.ok(!mail.html.includes('tail'), 'nothing past the cap')
  assert.ok(!mail.text.includes('tail'))
  assert.ok(/shortened/i.test(plain(mail.html)), 'the html says it was shortened')
  assert.ok(/shortened/i.test(mail.text), 'the text says it was shortened')

  const exact = declined({ declineComments: 'x'.repeat(2000) })
  assert.ok(!/shortened/i.test(exact.text + exact.html), '2,000 characters are kept whole, with no note')
  assert.ok(exact.text.includes('x'.repeat(2000)))
})

test('the cap counts characters, so an emoji is never cut in half', () => {
  const emoji = '\u{1F600}'
  const mail = declined({ declineComments: emoji.repeat(2500) })
  assert.ok(mail.html.includes(emoji.repeat(2000)) && !mail.html.includes(emoji.repeat(2001)))
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(mail.html + mail.text), 'no lone surrogate')
})

test('a quoteUrl that is not an absolute http(s) address, or holds a line break or space, is refused', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'ftp://unison.example/x', 'data:text/html,<b>x</b>', 'not a url', '/documents/1', '', 'https://']) {
    assert.throws(() => notice({ quoteUrl: bad }), JSON.stringify(bad))
  }
  assert.throws(() => notice({ quoteUrl: `${QUOTE_URL}\nBcc: evil@x.test` }), 'a line break')
  assert.throws(() => notice({ quoteUrl: `${QUOTE_URL}\r\nBcc: evil@x.test` }), 'a CRLF')
  assert.throws(() => notice({ quoteUrl: ` ${QUOTE_URL}` }), 'a leading space')
  assert.equal(anchors(notice({ quoteUrl: 'http://localhost:3000/documents/1' }).html)[0].href, 'http://localhost:3000/documents/1')
})

test('a quoteUrl with a quote mark cannot break out of the href', () => {
  const mail = notice({ quoteUrl: 'https://unison.example/a"onmouseover="alert(1)' })
  assert.ok(!/<a\b[^>]*\sonmouseover=/i.test(mail.html))
  assert.equal(anchors(mail.html).length, 1)
})

// ---------------------------------------------------------------------------------------------------------------
// An unexpected decision
// ---------------------------------------------------------------------------------------------------------------

test('a decision that is not accepted or declined throws rather than renders', () => {
  for (const bad of ['approved', 'ACCEPTED', 'Accepted', 'accept', '', ' accepted', null, undefined, 1, {}]) {
    assert.throws(() => ack({ decision: bad as never }), `acknowledgement ${String(bad)}`)
    assert.throws(() => notice({ decision: bad as never }), `notice ${String(bad)}`)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Hostile values
// ---------------------------------------------------------------------------------------------------------------

test('markup in a client-supplied value appears only escaped, in every template', () => {
  const mails = [
    code({ quoteNumber: IMG, clientName: SCRIPT }),
    ack({ quoteNumber: IMG, signatoryName: SCRIPT, ownerName: IMG, decidedOn: SCRIPT }),
    ack({ decision: 'declined', quoteNumber: IMG, signatoryName: IMG }),
    notice({ clientName: IMG, quoteNumber: SCRIPT, signatoryName: IMG, signatoryPosition: SCRIPT }),
    declined({ clientName: IMG, signatoryName: SCRIPT, signatoryPosition: IMG, declineReason: SCRIPT, declineComments: `${IMG}\n${SCRIPT}` }),
  ]
  for (const mail of mails) {
    assert.ok(!/<img/i.test(mail.html), 'no <img in the html')
    assert.ok(!/<script/i.test(mail.html), 'no <script in the html')
    assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(mail.html), 'no element carries an event handler (the payload is text, not a tag)')
    assert.ok(mail.html.includes(escapeHtml(IMG)), 'the value is there, escaped')
    const title = mail.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    assert.ok(title.length > 0 && !/[<>"\r\n]/.test(title), 'the document title is escaped')
  }
})

test('a name with CR/LF and a Bcc header cannot reach a subject or split a line of the text', () => {
  const mails = [
    code({ quoteNumber: CRLF, clientName: CRLF }),
    ack({ quoteNumber: CRLF, signatoryName: CRLF, ownerName: CRLF, decidedOn: CRLF }),
    notice({ clientName: CRLF, quoteNumber: CRLF, signatoryName: CRLF, signatoryPosition: CRLF }),
    declined({ clientName: CRLF, signatoryName: CRLF, signatoryPosition: CRLF, declineReason: CRLF }),
  ]
  for (const mail of mails) {
    assert.ok(!/[\r\n]/.test(mail.subject), JSON.stringify(mail.subject))
    assert.ok(!/(^|\n)Bcc:/i.test(mail.text), 'no line of the text starts a header')
    assert.ok(!mail.text.includes('\r'), 'no carriage return in the text')
  }
  assert.ok(notice({ clientName: CRLF }).subject.includes('Bcc: evil@x.test'), 'the words survive on one line')
})

test('a 5,000 character name is cut to one capped line in the subject, the html and the text', () => {
  const long = 'N'.repeat(5000)
  const mails = [
    ack({ quoteNumber: long, signatoryName: long, ownerName: long, decidedOn: long }),
    notice({ clientName: long, quoteNumber: long, signatoryName: long, signatoryPosition: long }),
    declined({ clientName: long, quoteNumber: long, signatoryName: long, signatoryPosition: long, declineReason: long }),
    code({ quoteNumber: long, clientName: long }),
  ]
  for (const mail of mails) {
    assert.ok(mail.subject.length <= 200, `subject length ${mail.subject.length}`)
    assert.ok(!mail.subject.includes('N'.repeat(81)), 'the subject holds no long run of it')
    assert.ok(!mail.html.includes('N'.repeat(201)) && !mail.text.includes('N'.repeat(201)), 'no field is longer than the line cap')
  }
  assert.ok(notice({ clientName: long, quoteNumber: 'HMK-Q-2026-00001' }).subject.endsWith(' accepted quotation HMK-Q-2026-00001'), 'the number survives a long client name')
})

test('a name with an ampersand and quotes is escaped in the html and plain in the subject and text', () => {
  const name = 'Smith & "Sons" <Pty> Ltd'
  const mail = declined({ clientName: name, signatoryName: name, signatoryPosition: name, declineComments: name })
  assert.equal(mail.subject, `${name} declined quotation HMK-Q-2026-00001`, 'the subject is not HTML-escaped')
  assert.ok(mail.html.includes('Smith &amp; &quot;Sons&quot; &lt;Pty&gt; Ltd'))
  assert.ok(!mail.html.includes('<Pty>') && !mail.html.includes('Smith & '), 'no raw ampersand or tag')
  assert.ok(mail.text.includes(`Signed by: ${name}`), 'the text is plain')
  assert.ok(!/&(amp|lt|gt|quot|#39);/.test(mail.text), 'no entities in the text')
  const acknowledgement = ack({ signatoryName: name })
  assert.ok(acknowledgement.html.includes('Hello Smith &amp; &quot;Sons&quot; &lt;Pty&gt; Ltd,'))
  assert.ok(acknowledgement.text.includes(`Hello ${name},`))
})

test('bidi override and control characters are dropped from every value', () => {
  const bad = `Acme${BIDI}gnos\u200f\u2066x\u2069\u0000\u0007`
  const mails = [
    code({ quoteNumber: bad, clientName: bad }),
    ack({ signatoryName: bad, quoteNumber: bad, ownerName: bad }),
    declined({ clientName: bad, signatoryName: bad, signatoryPosition: bad, declineReason: bad, declineComments: `${bad}\nline two` }),
  ]
  for (const mail of mails) {
    for (const part of [mail.subject, mail.html, mail.text]) {
      assert.ok(!/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u0000-\u0008\u000e-\u001f\u007f-\u009f]/.test(part), 'no bidi or control character')
    }
  }
  assert.equal(notice({ clientName: bad }).subject, 'Acmegnosx accepted quotation HMK-Q-2026-00001')
})

// ---------------------------------------------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------------------------------------------

test('every template has a non-empty subject and text part, and the text has no markup or entities', () => {
  for (const [name, mail] of everyTemplate()) {
    assert.ok(mail.subject.trim().length > 0, `${name}: subject`)
    assert.ok(mail.text.trim().length > 0, `${name}: text`)
    assert.ok(mail.text.trim().split('\n').length >= 2, `${name}: more than a line of text`)
    assert.ok(!/<\/?[a-z!]/i.test(mail.text), `${name}: no markup in the text`)
    assert.ok(!/&(amp|lt|gt|quot|#39|nbsp);/.test(mail.text), `${name}: no entities in the text`)
  }
})

test('every template is a complete single-column HTML document built from tables, with no images and nothing active', () => {
  for (const [name, mail] of everyTemplate()) {
    const html = mail.html
    assert.match(html, /^<!doctype html>/i, name)
    assert.match(html, /<html\b[^>]*\blang="en"/i, name)
    assert.match(html, /<meta\b[^>]*charset="utf-8"/i, name)
    assert.match(html, /<\/html>\s*$/i, name)
    assert.equal(tags(html, 'img').length, 0, `${name}: no images, so nothing can be blocked`)
    assert.ok(!/url\(|@import|expression\(/i.test(html), `${name}: no external style`)
    assert.ok(!/<(script|iframe|object|embed|form|link|base|input|button)\b/i.test(html), `${name}: nothing active`)
    assert.ok(!/javascript:/i.test(html), name)
    assert.ok(!/display:\s*(flex|grid)|float:|position:/i.test(html), `${name}: layout is tables only`)
    const tables = tags(html, 'table')
    assert.ok(tables.length >= 3, `${name}: tables`)
    for (const tag of tables) assert.ok(/role="presentation"/.test(tag), `${name}: ${tag}`)
    assert.ok(html.includes(`bgcolor="${NAVY}"`) && html.includes(NAVY), `${name}: the navy of the quote email`)
    assert.ok(/HIMARK/.test(plain(html)), `${name}: names HIMARK as text`)
  }
})

test('the document title is the subject, escaped', () => {
  const mail = notice({ clientName: 'Smith & Sons' })
  assert.ok(mail.html.includes('<title>Smith &amp; Sons accepted quotation HMK-Q-2026-00001</title>'))
  assert.ok(code().html.includes('<title>Your HIMARK confirmation code</title>'))
})
