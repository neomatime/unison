import 'server-only'

import { readAppUrl } from '@/lib/env'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function getAcquisitionAssetData(linkId: string) {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db
    .from('acquisition_links')
    .select('id, token, name')
    .eq('id', linkId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const base = new URL(readAppUrl(process.env))
  base.pathname = '/engage'
  base.search = ''
  base.hash = ''
  base.searchParams.set('s', data.token)
  const printReady = base.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)
  return { id: data.id as string, name: data.name as string, token: data.token as string, url: base.toString(), printReady }
}

export function publicEngagementUrl(token: string) {
  const base = new URL(readAppUrl(process.env))
  base.pathname = '/engage'
  base.search = ''
  base.hash = ''
  base.searchParams.set('s', token)
  return base.toString()
}

