const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Production redirects always use the configured application URL. During local
 * development, the browser's loopback origin is allowed so previews keep the
 * host and port that actually served the sign-in page.
 */
export function resolveAppOrigin(configuredAppUrl: string, requestOrigin?: string | null): string {
  const configuredOrigin = new URL(configuredAppUrl).origin
  if (!requestOrigin) return configuredOrigin

  try {
    const candidate = new URL(requestOrigin)
    if (!['http:', 'https:'].includes(candidate.protocol)) return configuredOrigin
    if (!LOOPBACK_HOSTS.has(candidate.hostname)) return configuredOrigin
    return candidate.origin
  } catch {
    return configuredOrigin
  }
}
