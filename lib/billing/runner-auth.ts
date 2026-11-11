import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * Whether a request to the billing runner carries the shared secret as `Authorization: Bearer <secret>` (what the host's cron
 * sends). Both sides are hashed before they are compared, so the comparison takes the same time whatever the length of what was
 * sent. An empty or missing secret authorises nothing, so a server that is not configured is closed, not open.
 */
export function isRunnerAuthorised(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (typeof secret !== 'string' || secret.length === 0) return false
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const sent = header.slice('Bearer '.length)
  if (sent.length === 0) return false
  return timingSafeEqual(digest(sent), digest(secret))
}
