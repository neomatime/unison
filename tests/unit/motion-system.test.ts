import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const theme = readFileSync(new URL('../../styles/unison.css', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8')

test('entrance animations never hold their end state, so they cannot trap fixed-position dialogs inside the block', () => {
  for (const name of ['unison-view-enter', 'unison-rise-in', 'unison-row-in', 'unison-indicator-in', 'unison-bar-grow']) {
    const use = theme.match(new RegExp(`animation: ${name}[^;]*;`))
    assert.ok(use, `${name} is used in the theme`)
    assert.match(use![0], /backwards;/, `${name} uses backwards fill, not both or forwards`)
    assert.doesNotMatch(use![0], /\b(both|forwards)\b/, `${name} does not hold its end state`)
  }
})

test('the shared motion tokens exist and the staggered page entrance leaves fixed and modal elements alone', () => {
  for (const token of ['--motion-view', '--motion-panel', '--motion-micro', '--motion-stagger', '--ease-lux']) assert.match(tokens, new RegExp(`${token}:`))
  assert.match(theme, /:not\(\[class\*='fixed'\]\):not\(\[role='dialog'\]\):not\(\[role='alertdialog'\]\)/)
  assert.match(theme, /:where\(:is\(\.unison-route-view/, 'the stagger has zero specificity, so a component animation class always wins')
  assert.match(globals, /@keyframes unison-rise-in/)
})

test('motion is switched off for reduced motion (including any delay) and for print', () => {
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-delay: 0s !important/)
  assert.match(theme, /@media print[\s\S]*animation: none !important/)
})
