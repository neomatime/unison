export const TENANT_SIGN_IN_PATH = '/sign-in'
export const INTERNAL_SIGN_IN_PATH = '/internal/sign-in'
export const INTERNAL_HOME_PATH = '/internal/overview'

/**
 * Matches the internal application at a path-segment boundary. This avoids
 * classifying unrelated routes such as `/internality` as privileged internal
 * destinations.
 */
export function isInternalPath(path: string): boolean {
  return path === '/internal' || path.startsWith('/internal/')
}

export function authEntryPathFor(destination: string): string {
  return isInternalPath(destination) ? INTERNAL_SIGN_IN_PATH : TENANT_SIGN_IN_PATH
}

