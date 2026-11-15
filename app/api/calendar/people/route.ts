import { NextResponse } from 'next/server'

import { cleanSearch } from '@/features/calendar/attendees'
import { searchInvitablePeople } from '@/features/operations/queries/phase-four'

/** The attendee search on the event form: GET /api/calendar/people?q=thandi. A short list of team members and contacts that match,
 *  for the signed-in member's organisation only. Nothing is returned for fewer than two characters. */
export async function GET(request: Request) {
  const query = cleanSearch(new URL(request.url).searchParams.get('q'))
  if (!query) return NextResponse.json({ people: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  try {
    return NextResponse.json({ people: await searchInvitablePeople(query) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ people: [], message: 'The search is unavailable. You can still type an email address.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
