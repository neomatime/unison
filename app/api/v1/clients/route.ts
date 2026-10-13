import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { readSupabasePublicEnv } from '@/lib/env'
import { parseClientFeedQuery } from '@/lib/integrations/client-feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }

type RpcResult = { data: { clients: unknown[]; nextCursor: string | null } | null; error: { message: string } | null }

// Read-only client feed for HIVE. The bearer key is checked inside
// get_clients_for_api_key, which scopes the result to the key's organisation.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ') || auth.length < 20) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }
  const query = parseClientFeedQuery(request.nextUrl.searchParams)
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400, headers })

  let env: ReturnType<typeof readSupabasePublicEnv>
  try {
    env = readSupabasePublicEnv(process.env)
  } catch {
    return NextResponse.json({ error: 'The client feed is not configured.' }, { status: 503, headers })
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = (await supabase.rpc('get_clients_for_api_key', {
    p_key: auth.slice(7),
    p_updated_since: query.updatedSince,
    p_cursor: query.cursor,
    p_limit: query.limit,
  } as never)) as unknown as RpcResult
  if (error) {
    console.error('[client-feed] lookup failed')
    return NextResponse.json({ error: 'The client feed is temporarily unavailable.' }, { status: 502, headers })
  }
  if (!data) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  return NextResponse.json({ schemaVersion: '1.0', ...data, generatedAt: new Date().toISOString() }, { headers })
}
