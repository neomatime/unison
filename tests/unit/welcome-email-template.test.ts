import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { welcomeEmailTemplate, type WelcomeEmailData } from '../../lib/email/templates/welcome.ts'
import { escapeHtml } from '../../lib/email/templates/safe.ts'
import * as copy from '../../features/documents/welcome-email-copy.ts'

// These tests prove STRUCTURE and WORDS only: that the markup is escaped, safe and shaped the way mail clients need, and that
// every word the owner approved is there, in order. They cannot show how Outlook, Gmail or Apple Mail draw it.

const BASE = 'https://unison.example'
const ELLIPSIS = String.fromCharCode(0x2026)

// The owner's approved text, written out here word for word (not read back from the copy module, so a slip in the module shows).
const SUBJECT = 'Welcome to HIMARK | Your Invoice & Next Steps'
const WELCOME_LINE = 'Welcome to HIMARK Strategic Growth Consulting.'
const THANK_YOU = 'Thank you for choosing to partner with us. We are pleased to confirm that your quotation has been successfully accepted.'
const LOOK_FORWARD = 'We look forward to building a productive relationship centred around your business objectives and delivering meaningful results together.'
const ATTACHED = 'To help you get started, we have attached the following documents:'
const DOCUMENTS = [
  { title: 'Your Invoice', sentence: 'Your invoice reflecting the approved commercial arrangement and applicable payment terms.' },
  { title: 'Welcome Letter', sentence: 'A formal introduction to HIMARK, our values and what you can expect from our partnership.' },
  { title: 'Your Next Steps', sentence: 'A guide outlining the onboarding process and what happens before your engagement begins.' },
]
const NEXT_HEADING = 'What happens next?'
const NEXT = [
  'Our onboarding team will prepare your secure HiVE Room onboarding workspace.',
  'Once it is ready, a HIMARK team member will send you a separate invitation with instructions for completing your onboarding requirements.',
  'Throughout this process, our team will be available to assist you.',
  'We look forward to working together.',
]
const WARM = 'Warm regards,'
const TEAM = 'The HIMARK Team'
const COMPANY = 'HIMARK Strategic Growth Consulting'
const TAGLINE = 'Human First. Tools Second.'

/** Every approved piece of text, in the order the owner approved it (after the greeting). */
const IN_ORDER = [
  WELCOME_LINE, THANK_YOU, LOOK_FORWARD, ATTACHED,
  ...DOCUMENTS.flatMap((document) => [document.title, document.sentence]),
  NEXT_HEADING, ...NEXT, WARM, TEAM, COMPANY, TAGLINE,
]

function data(overrides: Partial<WelcomeEmailData> = {}): WelcomeEmailData {
  return { recipientName: 'Thandi Nkosi', assetBaseUrl: BASE, ...overrides }
}
const render = (overrides: Partial<WelcomeEmailData> = {}) => welcomeEmailTemplate(data(overrides))

const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? []
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
/** The visible text of the HTML: no style block, no hidden preview line, no comments, no tags, entities of the escaper put back. */
const plain = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

// ---- the words -------------------------------------------------------------------------------------------------

test('the subject is exactly the approved one', () => {
  assert.equal(render().subject, SUBJECT)
  assert.equal(render({ recipientName: null }).subject, SUBJECT, 'the subject never depends on the contact')
  assert.equal(copy.WELCOME_EMAIL_SUBJECT, SUBJECT)
})

test('every approved sentence is in the HTML and in the text, once, in the approved order', () => {
  const mail = render()
  const visible = plain(mail.html)
  for (const [name, haystack] of [['html', visible], ['text', mail.text]] as const) {
    let from = 0
    for (const piece of IN_ORDER) {
      const at = haystack.indexOf(piece, from)
      assert.ok(at > -1, `${name}: "${piece}" is there, after the one before it`)
      from = at + piece.length
    }
    assert.ok(haystack.indexOf('Dear Thandi Nkosi,') < haystack.indexOf(WELCOME_LINE), `${name}: the greeting comes first`)
  }
  // The sentences that are not names are not repeated (the sign-off company line is the one text that is also in the brand bar).
  for (const sentence of [THANK_YOU, LOOK_FORWARD, ATTACHED, ...DOCUMENTS.map((document) => document.sentence), ...NEXT]) {
    assert.equal(mail.text.split(sentence).length - 1, 1, `text: "${sentence}" once`)
    assert.equal(visible.split(sentence).length - 1, 1, `html: "${sentence}" once`)
  }
})

test('the copy module holds the approved words word for word, and nothing else is hand-written in the template', () => {
  assert.equal(copy.WELCOME_EMAIL_SUBJECT, SUBJECT)
  assert.equal(copy.WELCOME_LINE, WELCOME_LINE)
  assert.deepEqual(copy.WELCOME_PARAGRAPHS, [THANK_YOU, LOOK_FORWARD])
  assert.equal(copy.WELCOME_ATTACHED, ATTACHED)
  assert.deepEqual(copy.WELCOME_DOCUMENT_LIST, DOCUMENTS)
  assert.equal(copy.WELCOME_NEXT_HEADING, NEXT_HEADING)
  assert.deepEqual(copy.WELCOME_NEXT_PARAGRAPHS, NEXT)
  assert.deepEqual(copy.WELCOME_SIGN_OFF, { closing: WARM, name: TEAM, company: COMPANY, tagline: TAGLINE })
  assert.equal(copy.WELCOME_DEFAULT_NAME, 'Valued Client')
  const template = readFileSync(join(process.cwd(), 'lib', 'email', 'templates', 'welcome.ts'), 'utf8')
  for (const piece of IN_ORDER) assert.ok(!template.includes(piece), `the template does not write "${piece}" by hand`)
})

test('the numbered list has three items, each with a bold title and one sentence', () => {
  const mail = render()
  assert.equal(copy.WELCOME_DOCUMENT_LIST.length, 3)
  for (const [index, document] of DOCUMENTS.entries()) {
    assert.ok(plain(mail.html).includes(`${index + 1}.`), `the number ${index + 1} is on the page`)
    const bold = new RegExp(`<strong\\b[^>]*>\\s*${document.title}\\s*</strong>`)
    assert.match(mail.html, bold, `${document.title} is bold`)
    assert.ok(mail.text.includes(`${index + 1}. ${document.title}\n`), `text: "${index + 1}. ${document.title}" on its own line`)
  }
  const text = mail.text
  assert.ok(text.indexOf('1. Your Invoice') < text.indexOf('2. Welcome Letter') && text.indexOf('2. Welcome Letter') < text.indexOf('3. Your Next Steps'))
})

test('the sign-off has the team name in bold and the tagline in italic', () => {
  const { html } = render()
  assert.match(html, /<strong\b[^>]*>\s*The HIMARK Team\s*<\/strong>/)
  assert.match(html, /<em\b[^>]*>\s*Human First\. Tools Second\.\s*<\/em>/)
  assert.match(html, /font-style:italic/)
})

test('what happens next has its own heading, above its four paragraphs', () => {
  const { html } = render()
  const h2 = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g) ?? []
  assert.equal(h2.length, 1)
  assert.ok(plain(h2[0]).includes(NEXT_HEADING))
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, 'one h1: the welcome line')
  assert.ok(plain((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1] ?? '').includes(WELCOME_LINE))
})

// ---- the greeting ----------------------------------------------------------------------------------------------

test('the greeting uses the contact name, one line, escaped', () => {
  const mail = render({ recipientName: 'Thandi Nkosi' })
  assert.ok(plain(mail.html).includes('Dear Thandi Nkosi,'))
  assert.ok(mail.text.startsWith('Dear Thandi Nkosi,\n'))
  const spaced = render({ recipientName: '  Thandi \n\t Nkosi  ' })
  assert.ok(spaced.text.startsWith('Dear Thandi Nkosi,\n'), 'whitespace runs and line breaks become single spaces')
  assert.ok(plain(spaced.html).includes('Dear Thandi Nkosi,'))
})

test('no contact name, a null one or a blank one gives the owner-approved default greeting', () => {
  for (const recipientName of [null, '', '   ', '\n\r\n\t ']) {
    const mail = render({ recipientName })
    assert.ok(plain(mail.html).includes('Dear Valued Client,'), JSON.stringify(recipientName))
    assert.ok(mail.text.startsWith('Dear Valued Client,\n'), JSON.stringify(recipientName))
  }
  assert.ok(!plain(render().html).includes('Valued Client'), 'the default is only used when there is no name')
})

test('a hostile contact name is escaped in the HTML and stays on one line', () => {
  const hostile = '<script>alert(1)</script>"\'&<img src=x onerror=alert(1)>\r\nBcc: evil@example.com\n\nDear Someone Else,'
  const mail = render({ recipientName: hostile })
  assert.ok(!/<script/i.test(mail.html), 'no script element')
  assert.ok(!mail.html.includes('<img src=x'), 'no injected image')
  assert.ok(mail.html.includes(escapeHtml('<script>alert(1)</script>')), 'the name is there, escaped')
  assert.deepEqual(tags(mail.html, 'img').map((tag) => attr(tag, 'src')?.startsWith(`${BASE}/brand/`)), [true, true], 'only our two images')
  // The payload's words are text on the page, escaped; no real tag carries an event handler.
  assert.deepEqual((mail.html.match(/<[a-z][^>]*>/gi) ?? []).filter((tag) => /\son[a-z]+\s*=/i.test(tag)), [], 'no event handler attribute')
  // One line in the text alternative: the greeting is the first line and the second line is blank.
  const lines = mail.text.split('\n')
  assert.ok(lines[0].startsWith('Dear <script>') && lines[0].endsWith(','), 'the greeting is one line')
  assert.equal(lines[1], '', 'and the blank line after it is the email\'s own')
  assert.equal(lines.filter((line) => line.startsWith('Bcc:')).length, 0, 'a line break in the name cannot start a header-looking line')
})

test('a very long contact name is cut to 200 characters on one line', () => {
  const long = 'N'.repeat(5000)
  const mail = render({ recipientName: long })
  assert.ok(mail.text.startsWith(`Dear ${'N'.repeat(200)}${ELLIPSIS},\n`))
  assert.ok(!mail.html.includes('N'.repeat(201)))
  assert.ok(mail.text.length < 3000, 'the whole text stays small')
})

// ---- safety and structure --------------------------------------------------------------------------------------

test('no placeholder, no undefined, null, NaN or empty element anywhere', () => {
  for (const mail of [render(), render({ recipientName: null }), render({ recipientName: '  ' })]) {
    for (const [name, haystack] of [['html', plain(mail.html)], ['text', mail.text]] as const) {
      assert.doesNotMatch(haystack, /\bundefined\b|\bnull\b|\bNaN\b|\[object|\{\{|\}\}|\$\{|%s|<>/, `${name} has no leftover value`)
    }
    assert.doesNotMatch(mail.html, /<(p|h1|h2|strong|em)\b[^>]*>\s*<\/\1>/i, 'no empty paragraph, heading or emphasis')
    assert.doesNotMatch(mail.html, /="undefined"|="null"|="NaN"/, 'no placeholder attribute value')
  }
})

test('the HTML is a complete, scriptless document with a language, an alt on every image and no outside styles or fonts', () => {
  const { html } = render()
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /<html\b[^>]*\blang="en"/i)
  assert.match(html, /<meta\b[^>]*charset="utf-8"/i)
  assert.match(html, /<meta\b[^>]*name="viewport"/i)
  assert.match(html, /<\/html>\s*$/i)
  assert.ok(html.includes(`<title>${escapeHtml(SUBJECT)}</title>`), 'the title is the escaped subject')
  assert.ok(!/<script/i.test(html) && !/javascript:/i.test(html))
  assert.ok(!/<(iframe|object|embed|form|link|base|input|button|video|audio|svg)\b/i.test(html))
  assert.ok(!/@import|@font-face|expression\(|url\(|font-display/i.test(html), 'no external CSS or web fonts')
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/&[a-z#0-9]+;/g, '')), 'no event handler attributes')
  assert.equal(tags(html, 'style').length, 1, 'only the phone media query')
  const images = tags(html, 'img')
  assert.ok(images.length > 0)
  for (const tag of images) {
    assert.ok((attr(tag, 'alt') ?? '').length > 0, `an alt on ${tag}`)
    assert.ok(attr(tag, 'width') && attr(tag, 'height'), `explicit size on ${tag}`)
    assert.ok(attr(tag, 'src')?.startsWith(`${BASE}/brand/`), `from the asset base: ${tag}`)
  }
})

test('every link in the email is one the template made: there are none', () => {
  const { html, text } = render()
  assert.equal(tags(html, 'a').length, 0, 'no link or button: the documents are attached, not linked')
  assert.ok(!/https?:\/\//.test(text), 'no address in the text alternative')
})

test('the layout is the quote email\'s: presentation tables, a 600 px container, bgcolor next to every background, a phone media query', () => {
  const { html } = render()
  const layoutTables = tags(html, 'table')
  assert.ok(layoutTables.length > 3)
  for (const tag of layoutTables) assert.match(tag, /role="presentation"/, `a layout table: ${tag}`)
  assert.match(html, /<!--\[if mso\]><table role="presentation" width="600"/, 'the Outlook ghost table')
  assert.match(html, /max-width:600px/)
  assert.match(html, /@media only screen and \(max-width:620px\)\{[\s\S]*?\.container\{width:100% !important\}[\s\S]*?\.pad\{padding-left:20px !important;padding-right:20px !important\}/)
  assert.ok(!/display:\s*(flex|grid)|float:|position:/i.test(html), 'no flex, grid, float or positioning')
  // Outlook ignores some CSS backgrounds: every background-color has its bgcolor attribute on the same element.
  for (const element of html.match(/<(?:td|table|body)\b[^>]*background-color:[^>]*>/gi) ?? []) assert.match(element, /\bbgcolor="#[0-9a-f]{6}"/i, `bgcolor beside the CSS background: ${element.slice(0, 80)}`)
})

test('every colour is one of the quote email\'s', () => {
  const quote = readFileSync(join(process.cwd(), 'lib', 'email', 'templates', 'quote.ts'), 'utf8')
  const palette = new Set((quote.match(/#[0-9a-f]{6}\b/gi) ?? []).map((colour) => colour.toLowerCase()))
  assert.ok(palette.has('#0d2340') && palette.has('#1769aa'), 'the navy and the ocean blue')
  const used = new Set((render().html.match(/(?<!&)#[0-9a-f]{6}\b/gi) ?? []).map((colour) => colour.toLowerCase()))
  assert.ok(used.size > 3)
  for (const colour of used) assert.ok(palette.has(colour), `${colour} is in the quote email's palette`)
  for (const amber of ['#fdf0d5', '#8a5a0a']) assert.ok(!used.has(amber), 'no status pill colour: this email has no status')
})

test('an unsafe asset base address throws, as in the quote email, and never repeats a secret', () => {
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'ftp://unison.example', 'data:text/html,x', 'file:///C:/brand', 'https://unison.example/a b', 'https://unison.example/\nx']) {
    assert.throws(() => render({ assetBaseUrl: bad }), /welcomeEmailTemplate: assetBaseUrl/, JSON.stringify(bad))
  }
  assert.throws(() => render({ assetBaseUrl: `https://user:hunter2@unison.example/${String.fromCharCode(0)}` }), (error: Error) => !error.message.includes('hunter2'))
})

test('the asset base keeps its scheme, host and path only: no credentials, query, fragment or trailing slash', () => {
  const mail = render({ assetBaseUrl: 'https://user:hunter2@unison.example/app/?token=abc#frag' })
  assert.ok(!mail.html.includes('hunter2') && !mail.html.includes('token=abc') && !mail.html.includes('#frag'))
  assert.ok(mail.html.includes('src="https://unison.example/app/brand/email-wordmark.png"'))
  assert.ok(render({ assetBaseUrl: 'http://localhost:3002/' }).html.includes('src="http://localhost:3002/brand/email-wordmark.png"'))
})

test('the wordmark is in the logo row only, once, above the welcome line, and the banner follows it; nothing else is an image', () => {
  const { html } = render()
  const wordmarks = html.match(/<img\b[^>]*email-wordmark\.png[^>]*>/g) ?? []
  const banners = html.match(/<img\b[^>]*email-banner\.jpg[^>]*>/g) ?? []
  assert.equal(wordmarks.length, 1)
  assert.equal(banners.length, 1)
  assert.equal(tags(html, 'img').length, 2, 'two images and no other')
  assert.equal(attr(wordmarks[0], 'alt'), 'HIMARK')
  assert.equal(attr(wordmarks[0], 'width'), '170')
  assert.equal(attr(banners[0], 'width'), '600')
  const at = (needle: string) => html.indexOf(needle)
  assert.ok(at('email-wordmark.png') < at('email-banner.jpg') && at('email-banner.jpg') < at('<h1'), 'wordmark, banner, then the words')
  assert.ok(html.slice(html.indexOf('<h1')).indexOf('<img') === -1, 'no image inside the message itself')
  // The brand bar above them is plain text on navy, so an email with its images blocked is still a branded block.
  assert.match(html, /<td id="brand-bar" bgcolor="#0d2340"/)
})

test('the plain text has no markup, no entities and the same words in a readable layout', () => {
  const { text } = render()
  assert.ok(!/<\/?[a-z!]/i.test(text), 'no markup in the text alternative')
  assert.ok(!/&(amp|lt|gt|quot|#39|nbsp|zwnj);/.test(text), 'no entities in the text alternative')
  assert.ok(!text.includes('\r'), 'LF line breaks')
  assert.ok(!/ \n/.test(text), 'no trailing spaces')
  assert.ok(!/\n{3,}/.test(text), 'never more than one blank line')
  assert.ok(text.endsWith(`${COMPANY}\n${TAGLINE}`), 'ends with the sign-off, no trailing newline')
  assert.ok(text.includes(`${WARM}\n${TEAM}\n${COMPANY}\n${TAGLINE}`), 'the sign-off is four consecutive lines')
  assert.ok(text.includes(`${ATTACHED}\n\n1. Your Invoice\n`), 'the list starts under its lead sentence')
})

test('no figure, no invoice number and no link: the amounts are in the attached invoice', () => {
  const mail = render()
  for (const [name, haystack] of [['html', plain(mail.html)], ['text', mail.text]] as const) {
    assert.deepEqual(haystack.match(/\d+/g), ['1', '2', '3'], `${name}: the only digits are the list numbers`)
    assert.doesNotMatch(haystack, /ZAR|\bR\s?\d|\bVAT\b|HMK-|invoice number|amount|total/i, name)
  }
  assert.ok(!/unsubscribe|privacy|terms and conditions/i.test(mail.html + mail.text), 'the quote email has no footer or legal lines, so none are carried and no unsubscribe link is invented')
})

test('the email never says paid, synced, handed off or completed', () => {
  const mail = render()
  assert.doesNotMatch(plain(mail.html) + mail.text, /\bpaid\b|synced|handed off|completed/i)
  assert.doesNotMatch(readFileSync(join(process.cwd(), 'features', 'documents', 'welcome-email-copy.ts'), 'utf8'), /\bpaid\b|synced|handed off|completed/i)
})

test('the hidden preview line uses only approved words', () => {
  const { html } = render()
  const preheader = html.match(/<div style="display:none[^>]*>([\s\S]*?)<\/div>/)
  assert.ok(preheader, 'a preview line')
  const words = plain(preheader[1]).trim()
  assert.ok(words.startsWith(WELCOME_LINE) && words.includes(THANK_YOU.split('. ')[0]), words)
})
