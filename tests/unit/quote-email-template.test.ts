import assert from 'node:assert/strict'
import test from 'node:test'
import { quoteEmailTemplate, type QuoteEmailData } from '../../lib/email/templates/quote.ts'
import { assertSafeUrl, escapeHtml, sanitizeLine } from '../../lib/email/templates/safe.ts'
import { EMAIL_DEFAULT_NOTE, EMAIL_HEADING, EMAIL_NEXT_STEPS } from '../../features/quote-portal/copy.ts'

// These tests prove STRUCTURE only: that the markup is escaped, safe and shaped the way mail clients need
// (tables, inline styles, bgcolor, explicit image sizes). They cannot show how Outlook, Gmail or Apple Mail draw it.

const TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v'
const REVIEW_URL = `https://unison.example/q/${TOKEN}`
const PDF_URL = `https://unison.example/q/${TOKEN}/pdf`
const NAVY = '#0d2340'

function data(overrides: Partial<QuoteEmailData> = {}): QuoteEmailData {
  return {
    quoteNumber: 'HMK-Q-2026-00001',
    clientName: 'Acme Holdings',
    projectName: 'Signature Partner',
    totalLabel: 'ZAR 230,000.00',
    vatNote: 'Excl. VAT',
    validUntil: '25 October 2026',
    statusLabel: 'Awaiting response',
    recipientName: 'Thandi Nkosi',
    personalNote: EMAIL_DEFAULT_NOTE,
    reviewUrl: REVIEW_URL,
    pdfUrl: PDF_URL,
    assetBaseUrl: 'https://unison.example',
    sender: {
      name: 'Neo Matime',
      role: 'Founder',
      company: 'HIMARK Strategic Growth Consulting',
      website: 'www.himark.co.za',
      email: 'info@himark.co.za',
      phone: '+27 10 000 0000',
    },
    ...overrides,
  }
}

const render = (overrides: Partial<QuoteEmailData> = {}, subject = 'Quote HMK-Q-2026-00001 from HIMARK') => quoteEmailTemplate(data(overrides), subject)

const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
const anchors = (html: string) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ tag: `<a${m[1]}>`, href: attr(`<a${m[1]}>`, 'href'), inner: m[2] }))
const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('the email is a complete HTML document with the heading, greeting, note and next-steps sentence', () => {
  const mail = render()
  assert.match(mail.html, /^<!doctype html>/i)
  assert.match(mail.html, /<html\b[^>]*\blang="en"/i)
  assert.match(mail.html, /<meta\b[^>]*charset="utf-8"/i)
  assert.match(mail.html, /<\/html>\s*$/i)
  const text = plain(mail.html)
  assert.ok(text.includes(EMAIL_HEADING), 'heading')
  assert.ok(text.includes('Hello Thandi Nkosi,'), 'greeting with the contact name')
  assert.ok(text.includes(EMAIL_DEFAULT_NOTE), 'the note')
  assert.ok(text.includes(EMAIL_NEXT_STEPS), 'what happens next')
  assert.ok(text.includes('Kind regards,'))
})

test('REVIEW QUOTATION and DOWNLOAD PDF are anchors to the two URLs', () => {
  const links = anchors(render().html)
  const review = links.find((l) => plain(l.inner).includes('REVIEW QUOTATION'))
  const pdf = links.find((l) => plain(l.inner).includes('DOWNLOAD PDF'))
  assert.ok(review && pdf)
  assert.equal(review.href, REVIEW_URL)
  assert.equal(pdf.href, PDF_URL)
})

test('the buttons are bulletproof: a bgcolor table cell holding a block-level anchor, navy and outline', () => {
  const { html } = render()
  const review = html.match(/<td\b[^>]*>\s*<a\b[^>]*href="https:\/\/unison\.example\/q\/[^"]*"[^>]*>\s*REVIEW QUOTATION/i)
  assert.ok(review, 'the review anchor sits directly in a table cell')
  assert.ok(review[0].includes(`bgcolor="${NAVY}"`), 'the cell carries a navy bgcolor attribute for Outlook')
  assert.match(review[0], /background-color:#0d2340/i)
  assert.match(review[0], /display:inline-block/)
  assert.match(review[0], /color:#ffffff/i)
  assert.ok(plain(html).includes('REVIEW QUOTATION →'), 'the arrow is plain text, not an image')

  const pdf = html.match(/<td\b[^>]*>\s*<a\b[^>]*href="https:\/\/unison\.example\/q\/[^"]*\/pdf"[^>]*>\s*DOWNLOAD PDF/i)
  assert.ok(pdf, 'the download anchor sits directly in a table cell')
  assert.match(pdf[0], /bgcolor="#ffffff"/i)
  assert.match(pdf[0], /border:1px solid/)
  assert.match(pdf[0], /display:inline-block/)
})

test('no scripts, no javascript: and nothing active', () => {
  for (const mail of [render(), render({ personalNote: '<script>alert(1)</script>', clientName: '<script>x</script>' })]) {
    assert.ok(!/<script/i.test(mail.html))
    assert.ok(!/javascript:/i.test(mail.html))
    assert.ok(!/<(iframe|object|embed|form|link|base)\b/i.test(mail.html))
    assert.ok(!/@import|expression\(|url\(/i.test(mail.html))
    assert.ok(!/\son[a-z]+\s*=/i.test(mail.html.replace(/&[a-z#0-9]+;/g, '')), 'no event handler attributes')
  }
})

test('the plain text lists the heading, note, details and both URLs, with no HTML', () => {
  const { text } = render()
  assert.ok(text.includes(EMAIL_HEADING))
  assert.ok(text.includes('Hello Thandi Nkosi,'))
  assert.ok(text.includes(EMAIL_DEFAULT_NOTE))
  for (const detail of ['HMK-Q-2026-00001', 'Acme Holdings', 'Signature Partner', 'ZAR 230,000.00', 'Excl. VAT', '25 October 2026', 'Awaiting response']) {
    assert.ok(text.includes(detail), `text has ${detail}`)
  }
  assert.ok(text.includes(REVIEW_URL))
  assert.ok(text.includes(PDF_URL))
  assert.ok(text.includes(EMAIL_NEXT_STEPS))
  assert.ok(text.includes('Neo Matime') && text.includes('www.himark.co.za') && text.includes('info@himark.co.za'))
  assert.ok(!/<\/?[a-z!]/i.test(text), 'no markup in the text alternative')
  assert.ok(!/&(amp|lt|gt|quot|#39);/.test(text), 'no entities in the text alternative')
})

test('a hostile client name and personal note appear only escaped in the HTML', () => {
  const img = '<img src=x onerror=alert(1)>'
  const injected = '"><a href=//evil>x</a>'
  const mail = render({ clientName: img, personalNote: `${injected}\n\n${img}` })
  assert.ok(!mail.html.includes(img), 'raw <img> payload')
  assert.ok(!mail.html.includes('<a href=//evil'), 'raw injected anchor')
  assert.ok(!mail.html.includes('"><a href=//evil'), 'attribute break-out')
  assert.ok(mail.html.includes(escapeHtml(img)), 'the client name is there, escaped')
  assert.ok(mail.html.includes(escapeHtml(injected)), 'the note is there, escaped')
  // The only elements that exist are ours: two images from the asset base, and anchors to our own URLs.
  const imgTags = tags(mail.html, 'img')
  assert.equal(imgTags.length, 2)
  for (const tag of imgTags) assert.ok(attr(tag, 'src')?.startsWith('https://unison.example/brand/'), `unexpected img ${tag}`)
  const hrefs = anchors(mail.html).map((a) => a.href)
  assert.deepEqual(hrefs.slice(0, 2), [REVIEW_URL, PDF_URL])
  for (const href of hrefs) assert.ok(!href?.includes('evil'), `unexpected href ${href}`)
})

test('every other single-line field is escaped too', () => {
  const evil = '<b onmouseover=x>'
  const mail = render({
    quoteNumber: evil, projectName: evil, totalLabel: evil, vatNote: evil, validUntil: evil, statusLabel: evil, recipientName: evil,
    sender: { name: evil, role: evil, company: evil, website: null, email: null, phone: evil },
  })
  assert.ok(!mail.html.includes('<b onmouseover'))
  assert.ok(mail.html.includes('&lt;b onmouseover=x&gt;'))
})

test('a 5,000 character note is included whole and escaped', () => {
  const note = 'A&B<'.repeat(1250)
  assert.equal(note.length, 5000)
  const mail = render({ personalNote: note })
  assert.ok(mail.html.includes('A&amp;B&lt;'.repeat(1250)), 'the whole escaped note is in the HTML')
  assert.ok(!mail.html.includes('A&B<'), 'no raw ampersand-and-bracket left')
  assert.ok(mail.text.includes(note), 'the whole note is in the text')
})

test('blank lines in the note become paragraphs and single newlines become <br>', () => {
  const mail = render({ personalNote: 'Hi there\nsecond line\n\nNew paragraph\r\n\r\n\r\nThird one' })
  assert.ok(mail.html.includes('Hi there<br>second line'))
  const paragraphs = [...mail.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1])
  assert.ok(paragraphs.includes('Hi there<br>second line'))
  assert.ok(paragraphs.includes('New paragraph'))
  assert.ok(paragraphs.includes('Third one'))
  assert.ok(!mail.html.includes('\r'), 'no carriage returns')
  assert.ok(!paragraphs.some((p) => p.includes('\n')), 'no raw newline inside a paragraph')
})

test('a blank personal note falls back to the default wording', () => {
  assert.ok(plain(render({ personalNote: '  \n \n ' }).html).includes(EMAIL_DEFAULT_NOTE))
  assert.ok(render({ personalNote: '' }).text.includes(EMAIL_DEFAULT_NOTE))
})

test('a subject with CR or LF is collapsed to one line, and escaped in the document title', () => {
  const mail = render({}, 'Quote 1\r\nBcc: spy@evil.example\nX: <b>y</b>')
  assert.ok(!/[\r\n]/.test(mail.subject))
  assert.equal(mail.subject, 'Quote 1 Bcc: spy@evil.example X: <b>y</b>')
  const title = mail.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  assert.ok(title && !/[\r\n<>]/.test(title))
  assert.equal(sanitizeLine('a\r\nb'), 'a b')
})

test('a reviewUrl or pdfUrl that is not http(s) throws, and the error does not carry the token', () => {
  for (const bad of ['javascript:alert(1)', 'ftp://unison.example/q/x', 'data:text/html,<b>x</b>', 'not a url', '/q/relative', '']) {
    assert.throws(() => render({ reviewUrl: bad }), `reviewUrl ${bad}`)
    assert.throws(() => render({ pdfUrl: bad }), `pdfUrl ${bad}`)
  }
  assert.throws(() => render({ reviewUrl: `ftp://unison.example/q/${TOKEN}` }), (error: Error) => !error.message.includes(TOKEN) && /reviewUrl/.test(error.message))
  assert.throws(() => render({ reviewUrl: `${REVIEW_URL}\nBcc: spy@evil.example` }), 'a URL with a line break')
  assert.throws(() => render({ reviewUrl: ` ${REVIEW_URL}` }), 'a URL with a space')
})

test('an unsafe asset base throws; a safe one builds the two image addresses', () => {
  assert.throws(() => render({ assetBaseUrl: 'javascript:alert(1)' }))
  assert.throws(() => render({ assetBaseUrl: 'ftp://unison.example' }))
  assert.throws(() => render({ assetBaseUrl: 'unison.example' }))
  for (const [base, expected] of [
    ['https://unison.example', 'https://unison.example'],
    ['https://unison.example/', 'https://unison.example'],
    ['https://unison.example/app/', 'https://unison.example/app'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://user:pass@unison.example/?x=1#frag', 'https://unison.example'],
  ] as const) {
    const srcs = tags(render({ assetBaseUrl: base }).html, 'img').map((t) => attr(t, 'src'))
    assert.deepEqual(srcs.sort(), [`${expected}/brand/email-banner.jpg`, `${expected}/brand/email-wordmark.png`], base)
  }
})

test('with images blocked the header is a navy block carrying the company name as text', () => {
  const mail = render()
  const bar = mail.html.match(/<td\b[^>]*\bid="brand-bar"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/i)
  assert.ok(bar, 'a header cell')
  assert.ok(bar[0].includes(`bgcolor="${NAVY}"`), 'bgcolor attribute (Outlook)')
  assert.match(bar[0], /background-color:#0d2340/i, 'and the CSS background')
  assert.ok(!/<img/i.test(bar[1]), 'it does not depend on an image')
  assert.ok(plain(bar[0]).includes('HIMARK Strategic Growth Consulting'), 'the company name as text')
  assert.ok(/PEOPLE\s*\|\s*STRATEGY\s*\|\s*PROGRESS/.test(plain(bar[0])), 'the strapline')
  // The first navy cell in the document is that header, so it sits above everything that needs an image.
  assert.ok(mail.html.indexOf(`bgcolor="${NAVY}"`) < mail.html.indexOf('<img'))
})

test('every image has alt text, explicit size, and block display with no border', () => {
  const imgs = tags(render().html, 'img')
  assert.equal(imgs.length, 2)
  for (const tag of imgs) {
    assert.ok((attr(tag, 'alt') ?? '').trim().length > 0, `alt on ${tag}`)
    assert.match(attr(tag, 'width') ?? '', /^\d+$/, `width on ${tag}`)
    assert.match(attr(tag, 'height') ?? '', /^\d+$/, `height on ${tag}`)
    const style = attr(tag, 'style') ?? ''
    assert.ok(style.includes('display:block') && style.includes('border:0'), `style on ${tag}`)
  }
  const wordmark = imgs.find((t) => attr(t, 'src')?.endsWith('/brand/email-wordmark.png'))
  assert.equal(attr(wordmark!, 'alt'), 'HIMARK')
  const banner = imgs.find((t) => attr(t, 'src')?.endsWith('/brand/email-banner.jpg'))
  assert.equal(attr(banner!, 'width'), '600')
  // Even an empty company name leaves non-empty alt text.
  for (const tag of tags(render({ sender: { ...data().sender, company: '  ' } }).html, 'img')) assert.ok((attr(tag, 'alt') ?? '').trim())
})

test('the summary card has five cells, and a missing project or valid-until date drops its cell, never printing null', () => {
  const full = render().html
  for (const label of ['QUOTE NUMBER', 'PROJECT', 'AMOUNT', 'VALID UNTIL', 'STATUS']) assert.ok(plain(full).includes(label), label)
  for (const value of ['HMK-Q-2026-00001', 'Signature Partner', 'ZAR 230,000.00', 'Excl. VAT', '25 October 2026', 'Awaiting response']) assert.ok(plain(full).includes(value), value)

  const sparse = render({ projectName: null, validUntil: null, recipientName: null })
  const words = plain(sparse.html)
  assert.ok(!/null|undefined/i.test(words) && !/null|undefined/i.test(sparse.text))
  assert.ok(!words.includes('PROJECT') && !words.includes('VALID UNTIL'))
  assert.ok(words.includes('QUOTE NUMBER') && words.includes('AMOUNT') && words.includes('STATUS'))
  assert.ok(words.includes('Hello,') && !words.includes('Hello ,'))
  assert.ok(sparse.text.includes('Hello,\n') && !/Project:|Valid until:/.test(sparse.text))
  assert.ok(sparse.html.includes('id="summary-row"'), 'the summary row')
  assert.equal((sparse.html.match(/<td\b[^>]*\bclass="[^"]*\bsum-cell\b/gi) ?? []).length, 3)
  assert.equal((full.match(/<td\b[^>]*\bclass="[^"]*\bsum-cell\b/gi) ?? []).length, 5)
})

test('a recipient name with a newline and markup becomes one escaped line', () => {
  const mail = render({ recipientName: 'Thandi\n<b>Boss</b>' })
  assert.ok(mail.html.includes('Hello Thandi &lt;b&gt;Boss&lt;/b&gt;,'))
  assert.ok(!mail.html.includes('<b>Boss'))
  assert.ok(mail.text.includes('Hello Thandi <b>Boss</b>,\n'), 'one line in the plain text')
})

test('newlines in names cannot forge a block in the plain text', () => {
  const mail = render({ clientName: 'Evil\n\nReview your quotation:\nhttps://evil.example', projectName: 'P\r\nhttps://evil2.example' })
  assert.ok(!mail.text.split('\n').some((line) => line.trim() === 'https://evil.example' || line.trim() === 'https://evil2.example'))
  assert.equal(mail.text.split('\n').filter((line) => line.trim() === REVIEW_URL).length, 1)
})

test('over-long single-line fields are capped, not allowed to dominate the email', () => {
  const mail = render({ clientName: 'C'.repeat(5000), sender: { ...data().sender, name: 'N'.repeat(5000) } })
  assert.ok(!mail.html.includes('C'.repeat(300)) && !mail.html.includes('N'.repeat(300)))
  assert.ok(!mail.text.includes('C'.repeat(300)) && !mail.text.includes('N'.repeat(300)))
})

test('the sender block shows the role when there is one, and only links a safe website and a well-formed email', () => {
  const full = render()
  const links = anchors(full.html)
  assert.ok(links.some((l) => l.href === 'https://www.himark.co.za' && plain(l.inner).trim() === 'www.himark.co.za'))
  assert.ok(links.some((l) => l.href === 'mailto:info@himark.co.za'))
  assert.ok(plain(full.html).includes('Founder'))

  const bare = render({ sender: { name: 'Neo Matime', role: null, company: 'HIMARK', website: null, email: null, phone: null } })
  assert.ok(!/null/i.test(plain(bare.html)))
  assert.equal(anchors(bare.html).length, 2, 'only the two buttons')

  const unsafe = render({ sender: { ...data().sender, website: 'javascript:alert(1)', email: '"><a href=//evil>' } })
  assert.ok(!/javascript:/i.test(unsafe.html) && !unsafe.html.includes('<a href=//evil'))
  assert.ok(!unsafe.html.includes('mailto:'))
  assert.deepEqual(anchors(unsafe.html).map((a) => a.href), [REVIEW_URL, PDF_URL])
  assert.ok(!unsafe.text.includes('javascript:'), 'an unsafe website is left out of the text too')

  const https = render({ sender: { ...data().sender, website: 'http://himark.co.za/about' } })
  assert.ok(anchors(https.html).some((l) => l.href === 'http://himark.co.za/about'))
})

test('structure a mail client needs: role=presentation tables, 600 px, inline styles, no flex, grid or positioning', () => {
  const { html } = render()
  const tables = tags(html, 'table')
  assert.ok(tables.length >= 8)
  for (const tag of tables) {
    assert.equal(attr(tag, 'role'), 'presentation', tag)
    assert.equal(attr(tag, 'cellpadding'), '0', tag)
    assert.equal(attr(tag, 'cellspacing'), '0', tag)
    assert.equal(attr(tag, 'border'), '0', tag)
  }
  assert.ok(html.includes('width="600"') && html.includes('max-width:600px'))
  assert.ok(!/position\s*:/i.test(html), 'no position')
  assert.ok(!/display\s*:\s*(flex|grid|inline-flex|inline-grid)/i.test(html), 'no flex or grid')
  assert.ok(!/float\s*:/i.test(html), 'no float')
  assert.ok(html.includes('font-family:Georgia'), 'the heading uses a serif stack')
  assert.ok(!/@font-face|fonts\.googleapis/i.test(html), 'no web fonts')
  assert.ok(!/<link\b/i.test(html), 'no external CSS')
  // The colours of the reference.
  for (const colour of [NAVY, '#1769aa', '#edf3f8', '#dce2e8', '#6e7d8c']) assert.ok(html.toLowerCase().includes(colour), colour)
})

test('the layout does not depend on a <style> block: only an optional phone media query lives there', () => {
  const { html } = render()
  const block = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)
  if (block) {
    const withoutMedia = block[1].replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').trim()
    assert.equal(withoutMedia, '', 'nothing but @media rules in the style block')
  }
  const stripped = html.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  // With the block gone the container, the header, the buttons and the card still carry everything they need inline.
  assert.match(stripped, /width="600"[^>]*style="[^"]*max-width:600px/)
  assert.ok((stripped.match(/bgcolor="#0d2340"/g) ?? []).length >= 2, 'header and review button keep their navy')
  assert.ok(stripped.includes('border-left:1px solid #dce2e8'), 'the card rules are inline')
  assert.match(stripped, /<body\b[^>]*bgcolor=/i)
})

test('a hidden preheader opens the body and says what the email is', () => {
  const { html } = render()
  const body = html.slice(html.search(/<body\b/i))
  const first = body.match(/<div\b[^>]*display:none[^>]*>([\s\S]*?)<\/div>/i)
  assert.ok(first, 'a hidden div')
  assert.ok(body.indexOf(first[0]) < body.indexOf('<table'), 'before any table')
  assert.ok(/max-height:0/.test(first[0]) && /overflow:hidden/.test(first[0]) && /mso-hide:all/.test(first[0]))
  assert.ok(plain(first[0]).includes('HMK-Q-2026-00001'))
  assert.ok(plain(first[0]).includes('Acme Holdings'))
})

test('the safe helpers keep their behaviour and take a label for the error text', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  assert.equal(sanitizeLine('  a \n\n b\t c '), 'a b c')
  assert.equal(sanitizeLine('x'.repeat(10), 4), 'xxxx…')
  assert.equal(assertSafeUrl('https://a.example/x?y=1', 'thing'), 'https://a.example/x?y=1')
  assert.throws(() => assertSafeUrl('javascript:alert(1)', 'thing'), /thing has a disallowed protocol "javascript:"/)
  assert.throws(() => assertSafeUrl('nope', 'thing'), /thing is not a valid absolute URL/)
})
