import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

test('no feature code imports the service-role client', () => {
  const offenders = walk(join(process.cwd(), 'features'))
    .filter((file) => /from ['"](@\/lib\/supabase\/admin|.*\/lib\/supabase\/admin)['"]/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [], `service-role client imported by: ${offenders.join(', ')}`)
})

test('the admin client is marked server-only', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'supabase', 'admin.ts'), 'utf8')
  assert.match(source, /import 'server-only'/)
})
