const DEFAULT_PATH = '/overview'

// Only a same-origin relative path is safe to redirect to after sign-in. Everything else
// (absolute URLs, protocol-relative URLs like `//evil.example`, and backslash variants some
// parsers treat as slashes, like `/\evil.example`) falls back to the default. This is an
// allowlist, not a blocklist: anything that doesn't clearly satisfy the safe shape is rejected.
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_PATH
  if (!value.startsWith('/')) return DEFAULT_PATH
  if (value.startsWith('//')) return DEFAULT_PATH
  if (value.startsWith('/\\')) return DEFAULT_PATH
  return value
}
