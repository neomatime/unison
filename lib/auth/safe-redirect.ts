const DEFAULT_PATH = '/overview'

// C0 controls (U+0000-U+001F) plus DEL (U+007F). The WHATWG URL parser strips ASCII tab, LF,
// and CR from anywhere in the input before parsing, so a value like `/\t/evil.example` looks
// like a safe single-slash path here but collapses to `//evil.example` — an external redirect —
// once handed to a URL parser (e.g. as a Location header). Rejecting every control character
// up front, before any prefix check runs, closes that class of smuggling rather than chasing
// individual characters.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/

// Only a same-origin relative path is safe to redirect to after sign-in. Everything else
// (absolute URLs, protocol-relative URLs like `//evil.example`, backslash variants some parsers
// treat as slashes like `/\evil.example`, and values containing control characters) falls back
// to the default. This is an allowlist, not a blocklist: anything that doesn't clearly satisfy
// the safe shape is rejected outright — never sanitised and reused.
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_PATH
  if (CONTROL_CHARACTERS.test(value)) return DEFAULT_PATH
  if (!value.startsWith('/')) return DEFAULT_PATH
  if (value.startsWith('//')) return DEFAULT_PATH
  if (value.startsWith('/\\')) return DEFAULT_PATH
  return value
}
