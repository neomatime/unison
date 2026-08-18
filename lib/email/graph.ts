import 'server-only'
import { readGraphEnv } from '@/lib/env'
import { extractAddress } from './mime'

// Microsoft Graph, client-credentials grant. No SDK: this is two fetch calls,
// and @azure/identity plus the Graph client would be a large dependency for
// exactly that.

const TOKEN_SCOPE = 'https://graph.microsoft.com/.default'

type CachedToken = { value: string; expiresAt: number }
let cachedToken: CachedToken | undefined

/** Discards the cached token. Tests use this; nothing in the app should need it. */
export function resetGraphTokenCache() {
  cachedToken = undefined
}

async function getAccessToken(): Promise<string> {
  // Tokens last about an hour. Re-fetching per email would be a needless round
  // trip on every send. Expire 60s early so a token cannot lapse in flight.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const env = readGraphEnv(process.env)
  const response = await fetch(
    `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: TOKEN_SCOPE,
        grant_type: 'client_credentials',
      }),
    },
  )

  if (!response.ok) {
    // Azure returns error_description with the actionable detail (expired
    // secret, consent not granted, wrong tenant). Surface it — but never the
    // request body, which carries the client secret.
    const detail = await response.text().catch(() => '')
    throw new Error(`Graph token request failed (${response.status}): ${detail.slice(0, 500)}`)
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!payload.access_token) throw new Error('Graph token response contained no access_token')

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

/**
 * Sends a raw MIME message as the configured mailbox.
 *
 * The app holds the Mail.Send application permission, which without an
 * ApplicationAccessPolicy would let it send as ANY mailbox in the tenant. The
 * sender is pinned to MAIL_FROM here so the application never chooses a
 * mailbox at runtime, but that is defence in depth, not the control — the
 * access policy is. See docs/follow-ups.md.
 */
export async function sendMimeViaGraph(mime: string): Promise<void> {
  const env = readGraphEnv(process.env)
  const sender = extractAddress(env.MAIL_FROM)
  const token = await getAccessToken()

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
      },
      body: Buffer.from(mime, 'utf8').toString('base64'),
    },
  )

  // Graph answers 202 Accepted with an empty body on success.
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Graph sendMail failed (${response.status}): ${detail.slice(0, 500)}`)
  }
}
