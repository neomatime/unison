import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { readSupabasePublicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EVENT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/
const MAX_SECRET_LENGTH = 512
const MAX_EXTERNAL_ID_LENGTH = 200

type IngestResult = {
  event_id: string
  run_ids: string[] | null
}

class InvalidBodyError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const secret = request.headers.get('x-unison-secret')?.trim() ?? ''
  if (!secret || secret.length > MAX_SECRET_LENGTH) return unauthorized()

  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return badRequest('The webhook body must be JSON.')

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return badRequest('The webhook body must be 64 KB or smaller.')
  }

  const { connectionId } = await params
  if (!UUID_PATTERN.test(connectionId)) return badRequest('The webhook URL is invalid.')

  const eventKey = request.headers.get('x-unison-event')?.trim() || 'webhook.received'
  if (!EVENT_KEY_PATTERN.test(eventKey)) return badRequest('The webhook event name is invalid.')

  const externalId = request.headers.get('x-unison-delivery-id')?.trim() || null
  if (externalId && externalId.length > MAX_EXTERNAL_ID_LENGTH) {
    return badRequest('The webhook delivery identifier is too long.')
  }

  let payload: Record<string, unknown>
  try {
    const rawBody = await readLimitedBody(request)
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InvalidBodyError()
    payload = parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof InvalidBodyError) return badRequest('The webhook body must be a JSON object.')
    return badRequest('The webhook body contains invalid JSON.')
  }

  const env = readSupabasePublicEnv(process.env)
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const { data, error } = await (supabase as any).rpc('ingest_integration_event', {
    p_connection_id: connectionId,
    p_secret: secret,
    p_event_key: eventKey,
    p_external_id: externalId,
    p_payload: payload,
  }) as { data: IngestResult[] | IngestResult | null; error: { code?: string; message?: string } | null }

  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.event_id) {
    // Do not reveal whether the connection exists, is disabled, has the wrong
    // secret, or rejected a duplicate delivery. The database retains the
    // detailed error for operators; an integration caller gets one response.
    console.error('[integration-webhook] event rejected', { code: error?.code ?? 'empty_result' })
    return unauthorized()
  }

  return NextResponse.json(
    { eventId: result.event_id, runIds: result.run_ids ?? [] },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  )
}

async function readLimitedBody(request: Request): Promise<string> {
  if (!request.body) throw new InvalidBodyError()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new InvalidBodyError()
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function unauthorized() {
  return NextResponse.json(
    { message: 'Webhook credentials were not accepted.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}
