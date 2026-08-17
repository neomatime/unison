'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function acceptInvitationAction(_prev: { error?: string } | undefined, formData: FormData) {
  // 1. Validate.
  const token = String(formData.get('token') ?? '')
  if (!token) return { error: 'This invitation link is incomplete.' }

  // 2 & 3. Authorise + mutate. public.accept_invitation() does both
  // atomically inside the database: it checks the caller is authenticated
  // with a verified email, that the token resolves to a pending, unexpired
  // invitation addressed to the caller's own email, and then writes the
  // membership row. None of that is reimplemented here — the RPC's error
  // message is surfaced as-is.
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('accept_invitation', { raw_token: token })
  if (error) return { error: error.message }

  // 4. "Revalidate": accept_invitation returns the organization id the
  // caller just joined. Land them on it immediately rather than whatever
  // org the cookie previously named, then redirect — which forces a fresh
  // fetch of everything downstream instead of leaving stale cached data.
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, data as string, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })

  redirect('/overview')
}
