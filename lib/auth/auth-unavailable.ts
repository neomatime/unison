/**
 * Separates "this caller has no session" from "we could not reach the
 * authentication service to find out".
 *
 * Both arrive at the same place in the code — `getUser()` yields no user, and
 * `exchangeCodeForSession()` yields no session — so without this check a
 * network fault is indistinguishable from a signed-out visitor. It gets treated
 * as one, which turns a momentary loss of connectivity into an apparent
 * sign-out, and turns a failed token exchange into a message blaming Microsoft
 * for something Microsoft did correctly.
 *
 * supabase-js raises AuthRetryableFetchError for exactly this case: the request
 * never got an answer, as opposed to getting one that refused the caller.
 */
export const AUTH_UNAVAILABLE_ERROR = 'unavailable'

export function isAuthServiceUnavailable(error: { name?: string } | null | undefined): boolean {
  return error?.name === 'AuthRetryableFetchError'
}
