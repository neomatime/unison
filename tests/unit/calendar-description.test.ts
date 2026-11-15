import assert from 'node:assert/strict'
import test from 'node:test'

import { agendaHtml, agendaMinutes, formatMinutes, invitationHtml, parseAgenda, parseBlocks, parseInline, toHtml } from '../../features/calendar/description.ts'

test('inline: bold, labelled links and bare links are read; the rest stays text', () => {
  assert.deepEqual(parseInline('a **b** c'), [{ kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' c' }])
  assert.deepEqual(parseInline('[site](https://x.example/a)'), [{ kind: 'link', text: 'site', href: 'https://x.example/a' }])
  assert.deepEqual(parseInline('see https://x.example/a.'), [{ kind: 'text', text: 'see ' }, { kind: 'link', text: 'https://x.example/a', href: 'https://x.example/a' }, { kind: 'text', text: '.' }])
  // Only http(s) becomes a link.
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ kind: 'text', text: '[x](javascript:alert(1))' }])
})

test('blocks: paragraphs, bullets and numbered lines, split on blank lines', () => {
  const blocks = parseBlocks('Intro\nsecond line\n\n- one\n- two\n\n1. first\n2. second')
  assert.deepEqual(blocks.map((block) => block.kind), ['p', 'ul', 'ol'])
  assert.equal((blocks[0] as { lines: unknown[] }).lines.length, 2)
  assert.equal((blocks[1] as { items: unknown[] }).items.length, 2)
  assert.deepEqual(parseBlocks(''), [])
  assert.deepEqual(parseBlocks(null), [])
})

test('html: everything is escaped, so nothing typed can become markup', () => {
  assert.equal(toHtml('<script>alert(1)</script> **<b>**'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>&lt;b&gt;</strong></p>')
  assert.equal(toHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>')
  assert.equal(toHtml('x\ny'), '<p>x<br>y</p>')
  assert.equal(toHtml('[a](https://x.example/?q="1")'), '<p><a href="https://x.example/?q=&quot;1&quot;">a</a></p>')
})

test('agenda: items without a title are dropped, minutes are checked, and there are at most 20', () => {
  assert.deepEqual(parseAgenda('[{"title":" Intro ","minutes":5},{"title":"","minutes":9},{"title":"Close","minutes":"x"},{"title":"Long","minutes":9999}]'), [
    { title: 'Intro', minutes: 5 },
    { title: 'Close', minutes: null },
    { title: 'Long', minutes: null },
  ])
  assert.deepEqual(parseAgenda('not json'), [])
  assert.deepEqual(parseAgenda(null), [])
  assert.equal(parseAgenda(Array.from({ length: 30 }, (_, i) => ({ title: `i${i}`, minutes: 1 }))).length, 20)
})

test('agenda: total, minutes wording and the invitation body', () => {
  const items = [{ title: 'Intro', minutes: 5 }, { title: 'Proposal <review>', minutes: 90 }, { title: 'Close', minutes: null }]
  assert.equal(agendaMinutes(items), 95)
  assert.equal(formatMinutes(45), '45 min')
  assert.equal(formatMinutes(60), '1 h')
  assert.equal(formatMinutes(95), '1 h 35 min')
  assert.equal(agendaHtml([]), '')
  assert.equal(agendaHtml(items), '<p><strong>Agenda</strong></p><ol><li>Intro (5 min)</li><li>Proposal &lt;review&gt; (1 h 30 min)</li><li>Close</li></ol>')
  assert.equal(invitationHtml('Hello', items.slice(0, 1)), '<p>Hello</p><p><strong>Agenda</strong></p><ol><li>Intro (5 min)</li></ol>')
})
