import 'server-only'

import { notFound } from 'next/navigation'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type SupportTicket = {
  id: string
  ticket_number: number
  subject: string
  category: string
  priority: string
  description: string
  status: string
  resolution: string | null
  created_at: string
  updated_at: string
}

export async function listSupportTickets() {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any).from('support_tickets')
    .select('id,ticket_number,subject,category,priority,description,status,resolution,created_at,updated_at')
    .eq('organization_id', organization.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SupportTicket[]
}

export async function getSupportTicket(id: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any).from('support_tickets')
    .select('id,ticket_number,subject,category,priority,description,status,resolution,created_at,updated_at')
    .eq('organization_id', organization.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return data as SupportTicket
}

export function supportReference(ticketNumber: number) { return `SUP-${String(ticketNumber).padStart(6, '0')}` }
