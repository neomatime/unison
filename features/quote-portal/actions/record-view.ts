'use server'

import { recordPortalView } from '@/lib/quote-portal/portal-client'

/**
 * Called from the browser once the portal page has loaded: this, and nothing the server does while rendering, is what
 * marks a quote as opened. A failure here must never break the page the client is reading, so it is logged without
 * the token (portal-client throws token-free errors) and swallowed.
 */
export async function recordViewAction(token: string): Promise<void> {
  try {
    await recordPortalView(token)
  } catch (error) {
    console.error('[quote-portal:view]', error instanceof Error ? error.message : 'unknown error')
  }
}
