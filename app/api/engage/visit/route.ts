import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordPublicVisit } from '@/features/prospect-engagement/public-data'

export const runtime = 'nodejs'

const visitSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) })

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403, headers: noStoreHeaders() })
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return new NextResponse(null, { status: 400, headers: noStoreHeaders() })
  }
  const parsed = visitSchema.safeParse(input)
  if (!parsed.success) return new NextResponse(null, { status: 400, headers: noStoreHeaders() })
  try {
    await recordPublicVisit(parsed.data.token)
  } catch (error) {
    console.error('[prospect-engagement] visit attribution failed', { message: error instanceof Error ? error.message : '' })
  }
  return new NextResponse(null, { status: 204, headers: noStoreHeaders() })
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

