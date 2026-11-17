import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// A menu drawn inside a table is clipped by the table's scroll container and hides the row when the list is short. Menus on
// screens that hold a table must be portalled (Base UI Popover.Portal), never positioned with "absolute top-full".

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === '.claude') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : []
  })
}

const dropdownInline = /absolute[^"'`]*\b(top-full|bottom-full|top-12)\b[^"'`]*\bz-\d+|\bz-\d+[^"'`]*absolute[^"'`]*\b(top-full|bottom-full|top-12)\b/

test('no screen with a table draws a menu or popover inside it', () => {
  const offenders: string[] = []
  for (const dir of ['app', 'features', 'components']) {
    for (const path of files(dir)) {
      const source = readFileSync(path, 'utf8')
      if (!source.includes('<table')) continue
      const lines = source.split('\n').filter((line) => dropdownInline.test(line))
      if (lines.length) offenders.push(path)
    }
  }
  assert.deepEqual(offenders, [], 'these files draw a menu inside a table')
})

test('the shared row menu, the hint, the column picker and the filter popover are portalled', () => {
  for (const path of ['components/shared/row-action-menu.tsx', 'components/ui/info-hint.tsx', 'features/registers/components/register-row-menu.tsx']) {
    assert.match(readFileSync(path, 'utf8'), /Popover\.Portal/, `${path} must portal its popup`)
  }
  const records = readFileSync('features/product-ui/components/record-collection-workspace.tsx', 'utf8')
  assert.match(records, /<Popover\.Portal>/)
  assert.doesNotMatch(records, /absolute top-full right-0 z-30 mt-2 w-56/)
  const modules = readFileSync('features/product-ui/components/module-workspace.tsx', 'utf8')
  assert.match(modules, /RowActionMenu/)
  assert.doesNotMatch(modules, /absolute top-12 right-4/)
  assert.doesNotMatch(modules, /absolute top-full left-0 z-30 mt-2 w-72/)
})
