import { NextResponse } from 'next/server'

import { runBillingNow } from '@/features/billing-runner/run-billing'
import { isRunnerAuthorised } from '@/lib/billing/runner-auth'
import { readCronSecret } from '@/lib/env'

// The billing runner (accept to invoice, stage 2): the host's cron calls this once a day. It has no browser session; the shared
// secret is its only credential (proxy.ts lets the path through for that reason, and nothing else). With the secret missing from
// the server, or wrong on the request, it does nothing and says nothing about which. It answers with counts only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const respond = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function handle(request: Request) {
  let secret: string
  try {
    secret = readCronSecret(process.env)
  } catch {
    console.error('[billing-run] the runner secret is not configured')
    return respond({ message: 'Unavailable.' }, 503)
  }
  if (!isRunnerAuthorised(request.headers.get('authorization'), secret)) return respond({ message: 'Unauthorised.' }, 401)

  try {
    return respond(await runBillingNow(), 200)
  } catch (error) {
    console.error('[billing-run] the run failed', error instanceof Error ? error.name : 'unknown error')
    return respond({ message: 'The run failed.' }, 500)
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
