import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'

import { readWebsiteLeadIngestSecret } from '@/lib/env'
import {
  mapWebsiteLead,
  verifyWebsiteLeadSignature,
  websiteLeadSchema,
} from '@/lib/integrations/website-leads'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 32 * 1024

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return badRequest('The request body must be JSON.')

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return badRequest('The request body is too large.')
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return badRequest('The request body could not be read.')
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return badRequest('The request body is too large.')
  }

  let secret: string
  try {
    secret = readWebsiteLeadIngestSecret(process.env)
  } catch {
    console.error('[website-leads] ingestion secret is not configured')
    return NextResponse.json(
      { message: 'Lead ingestion is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const signature = request.headers.get('x-himark-signature')?.trim().toLowerCase() ?? ''
  if (!verifyWebsiteLeadSignature(rawBody, signature, secret)) return unauthorized()

  let input: unknown
  try {
    input = JSON.parse(rawBody)
  } catch {
    return badRequest('The request body contains invalid JSON.')
  }
  const parsed = websiteLeadSchema.safeParse(input)
  if (!parsed.success) return badRequest('The lead payload is invalid.')

  const supabase = createAdminSupabase()
  const { data, error } = await supabase
    .from('leads')
    .upsert(mapWebsiteLead(parsed.data), {
      onConflict: 'organization_id,website_submission_key',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[website-leads] lead upsert failed', { code: error?.code ?? 'empty_result' })
    return NextResponse.json(
      { message: 'The lead could not be recorded.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    { leadId: data.id },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  )
}

function unauthorized() {
  return NextResponse.json(
    { message: 'Lead ingestion credentials were not accepted.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}
