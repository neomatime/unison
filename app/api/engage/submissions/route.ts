import { Buffer } from 'node:buffer'

import { NextResponse } from 'next/server'

import { engagementSubmissionSchema } from '@/features/prospect-engagement/schema'
import { consumePublicRateLimit, submitProspectEngagement } from '@/features/prospect-engagement/public-data'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 48 * 1024

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return response('The request origin was not accepted.', 403)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return response('The request body must be JSON.', 400)
  }
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return response('The request body is too large.', 413)

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return response('The request body could not be read.', 400)
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return response('The request body is too large.', 413)

  let input: unknown
  try {
    input = JSON.parse(rawBody)
  } catch {
    return response('The request body contains invalid JSON.', 400)
  }
  const parsed = engagementSubmissionSchema.safeParse(input)
  if (!parsed.success) return response(parsed.error.issues[0]?.message ?? 'Please review your answers.', 400)

  // A filled honeypot receives a normal acknowledgement but never creates CRM data.
  if (parsed.data.website) return NextResponse.json({ accepted: true }, { status: 202, headers: noStoreHeaders() })

  const startedAt = new Date(parsed.data.startedAt).getTime()
  const elapsed = Date.now() - startedAt
  if (!Number.isFinite(startedAt) || elapsed < 2_000 || elapsed > 2 * 60 * 60 * 1000) {
    return response('Please refresh the page and try again.', 400)
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim()
  const identifier = `${forwardedFor || 'unknown'}|${request.headers.get('user-agent') || 'unknown'}`
  try {
    if (!(await consumePublicRateLimit(identifier))) return response('Too many attempts. Please try again later.', 429)
    await submitProspectEngagement(parsed.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/SOURCE_UNAVAILABLE|FORM_VERSION_UNAVAILABLE|FORM_VERSION_MISMATCH/.test(message)) {
      return response('This engagement link is no longer available.', 410)
    }
    console.error('[prospect-engagement] submission failed', { message })
    return response('We could not send your enquiry. Please try again.', 503)
  }

  return NextResponse.json({ accepted: true }, { status: 202, headers: noStoreHeaders() })
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const expectedHost = request.headers.get('x-forwarded-host')?.split(',', 1)[0]?.trim() || request.headers.get('host')
    return Boolean(expectedHost) && new URL(origin).host === expectedHost
  } catch {
    return false
  }
}

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
}

function response(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: noStoreHeaders() })
}

