import { NextResponse } from 'next/server'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { organization } = await getSessionContext()
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (query.length < 2) return NextResponse.json({ results: [] })
    if (query.length > 120) return NextResponse.json({ message: 'Search terms must be 120 characters or fewer.' }, { status: 400 })
    const supabase = await createServerSupabase()
    const { data, error } = await (supabase as any).rpc('search_organization_records', {
      target_organization: organization.id,
      search_query: query,
      result_limit: 25,
    })
    if (error) return NextResponse.json({ message: error.message }, { status: 422 })
    return NextResponse.json({ results: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Search is unavailable.' }, { status: 500 })
  }
}
