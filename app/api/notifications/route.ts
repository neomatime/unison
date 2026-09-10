import { NextResponse } from 'next/server'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET() {
  try {
    const { organization, user } = await getSessionContext()
    const supabase = await createServerSupabase()
    const { data, error } = await (supabase as any).from('notifications')
      .select('id,title,body,category,href,read_at,created_at')
      .eq('organization_id', organization.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ message: error.message }, { status: 422 })
    return NextResponse.json({ notifications: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Notifications are unavailable.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { organization, user } = await getSessionContext()
    const body = await request.json() as { id?: string; all?: boolean }
    if (!body.all && (!body.id || !uuidPattern.test(body.id))) return NextResponse.json({ message: 'Choose a valid notification.' }, { status: 400 })
    const supabase = await createServerSupabase()
    let query = (supabase as any).from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('organization_id', organization.id)
      .eq('user_id', user.id)
      .is('read_at', null)
    if (!body.all) query = query.eq('id', body.id)
    const { error } = await query
    if (error) return NextResponse.json({ message: error.message }, { status: 422 })
    return NextResponse.json({ updated: true })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Notifications could not be updated.' }, { status: 500 })
  }
}
