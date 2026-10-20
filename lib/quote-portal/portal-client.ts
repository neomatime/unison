import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isPortalToken } from '@/lib/quote-portal/token'
import { PORTAL_STATES, type PortalQuote } from '@/lib/quote-portal/types'

/**
 * The only way the quote portal reaches the database, and the only file of the portal that holds the service role.
 *
 * WHY THE SERVICE ROLE
 * The portal has no session. The link token is the credential, and portal_get_quote / portal_record_view are granted
 * to service_role only, so the database API cannot be called with the public key. Nothing is granted to anon.
 *
 * WHAT THIS FILE PROMISES
 * - A string that is not shaped like a token never reaches the database, and never even builds the client: it is the
 *   same "link not valid" answer as an unknown token.
 * - The token is never written into an error message or a log line. A database error is reduced to its code (a
 *   message, detail or hint could quote the parameter it failed on) and no cause is attached.
 * - Opening the page only reads. "Viewed" is stamped by recordPortalView, which the page calls from the browser once it
 *   has loaded, so a mail scanner that fetches the link changes nothing.
 */

/** The database error as far as this file is willing to repeat it. */
function failure(operation: string, error: { code?: unknown }): Error {
  const code = typeof error.code === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(error.code) ? ` (code ${error.code})` : ''
  return new Error(`${operation} failed${code}`)
}

/** Reads the quote a link points at. A malformed token is `{ state: 'invalid' }` with no database call; a database error throws. */
export async function getPortalQuote(token: string): Promise<PortalQuote> {
  if (!isPortalToken(token)) return { state: 'invalid' }
  // Untyped, like the other database clients: types/database.ts predates these functions.
  const admin = createAdminSupabase() as any
  const { data, error } = await admin.rpc('portal_get_quote', { p_token: token })
  if (error) throw failure('portal_get_quote', error)
  // The page reads this object by its keys. An answer that is not one of the six states means the database contract is
  // broken, which is a fault to show as a temporary error rather than something to render.
  const state = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as { state?: unknown }).state : undefined
  if (typeof state !== 'string' || !(PORTAL_STATES as readonly string[]).includes(state)) {
    throw new Error('portal_get_quote returned an unexpected answer')
  }
  return data as PortalQuote
}

/** Stamps the first time the link was opened and counts the view. A malformed token does nothing; a database error throws. */
export async function recordPortalView(token: string): Promise<void> {
  if (!isPortalToken(token)) return
  const admin = createAdminSupabase() as any
  const { error } = await admin.rpc('portal_record_view', { p_token: token })
  if (error) throw failure('portal_record_view', error)
}
