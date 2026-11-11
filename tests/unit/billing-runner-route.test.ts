import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Accept to invoice, stage 2, task 5: source guards for the runner's route, its wiring and its schedule, in the house style (the
// route cannot be imported here: it uses server-only modules). Each assertion is about what must stay true, not about layout.

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const ROUTE = 'app/api/billing/run/route.ts'
const WIRING = 'features/billing-runner/run-billing.ts'

test('the route exports GET and POST, runs on Node, is never cached, and answers every response with no-store', () => {
  const source = read(ROUTE)
  assert.match(source, /export const runtime = 'nodejs'/)
  assert.match(source, /export const dynamic = 'force-dynamic'/)
  assert.match(source, /export async function GET\(/)
  assert.match(source, /export async function POST\(/)
  assert.match(source, /'Cache-Control': 'no-store'/)
  assert.equal((source.match(/NextResponse\.json\(/g) ?? []).length, 1, 'every JSON answer goes through the one no-store helper')
})

test('the secret is read inside the handler and checked before anything that touches the database or the mail server runs', () => {
  const source = read(ROUTE)
  const handler = source.slice(source.indexOf('async function handle'))
  const secretAt = handler.indexOf('readCronSecret(')
  const checkAt = handler.indexOf('isRunnerAuthorised(')
  const runAt = handler.indexOf('runBillingNow(')
  assert.ok(secretAt > 0 && checkAt > secretAt && runAt > checkAt, 'read the secret, then check it, then run')
  assert.doesNotMatch(source.slice(0, source.indexOf('async function handle')), /readCronSecret\(/, 'never read at import')
  for (const status of ['503', '401', '500']) assert.match(source, new RegExp(`, ${status}\\)`), `answers ${status}`)
})

test('the route never prints the secret, the header or an error message', () => {
  const source = read(ROUTE)
  const logs = [...source.matchAll(/console\.[a-z]+\((.*)\)\r?\n/g)].map((match) => match[1])
  assert.ok(logs.length >= 2, 'the route logs its failures')
  for (const args of logs) {
    // A fixed sentence, optionally followed by the error's class name: never the secret, a header or an error's message.
    assert.match(args, /^'[^']*'(, error instanceof Error \? error\.name : 'unknown error')?$/, `a log line names more than it should: ${args}`)
  }
  assert.doesNotMatch(source, /message: (error|String\(error)/)
})

test('proxy.ts exempts exactly /api/billing/run from the sign-in redirect', () => {
  const source = read('proxy.ts')
  assert.match(source, /'\/api\/billing\/run'/)
  assert.equal((source.match(/\/api\/billing/g) ?? []).length, 1)
})

test('vercel.json schedules the route once a day', () => {
  const config = JSON.parse(read('vercel.json'))
  assert.deepEqual(config.crons, [{ path: '/api/billing/run', schedule: '0 3 * * *' }])
})

test('the route ships the brand images its PDFs draw', () => {
  assert.match(read('next.config.mjs'), /'\/api\/billing\/run': \['\.\/public\/brand\/\*\*\/\*'\]/)
})

test('only the wiring file imports the service-role client, and it is on the boundary list with its reason', () => {
  assert.ok(existsSync(join(process.cwd(), WIRING)))
  assert.match(read(WIRING), /from '@\/lib\/supabase\/admin'/)
  assert.match(read(WIRING), /^import 'server-only'/m)
  for (const file of ['features/billing-runner/run.ts', 'features/documents/billing-run-copy.ts', 'lib/billing/runner-auth.ts', ROUTE]) {
    assert.doesNotMatch(read(file), /supabase\/admin/, `${file} must not import the admin client`)
  }
  assert.match(read('tests/unit/service-role-boundary.test.ts'), /'features\/billing-runner\/run-billing\.ts'/)
})

test('the pure modules have no @/ import, no server-only and no directive', () => {
  for (const file of ['features/billing-runner/run.ts', 'features/documents/billing-run-copy.ts', 'lib/billing/runner-auth.ts']) {
    const source = read(file)
    assert.doesNotMatch(source, /from '@\//, `${file}: no @/ import`)
    assert.doesNotMatch(source, /import 'server-only'/, `${file}: no server-only`)
    assert.doesNotMatch(source, /^'use (server|client)'/m, `${file}: no directive`)
  }
})

test('the wiring does not use the welcome email: only the first invoice of a plan does', () => {
  const source = read(WIRING)
  assert.doesNotMatch(source, /prepareWelcomeEmail|welcome-email|isWelcomeInvoice/)
  assert.match(source, /monthlyInvoiceEmail/)
  assert.match(source, /MAX_EMAIL_PDF_BYTES/)
  assert.match(source, /HOURLY_EMAIL_CAP/)
})

test('the wiring logs ids and error codes only: no address, no message, no invoice body', () => {
  const source = read(WIRING)
  for (const match of source.matchAll(/console\.[a-z]+\(([^)]*)\)/g)) {
    assert.doesNotMatch(match[1], /\.(to|message|text|html|body|subject)\b/, `a log line names data: ${match[0]}`)
  }
})
