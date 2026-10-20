// The shape of a quote portal link token. Pure, shared by server and client code and by unit tests: no directive, no imports.
//
// A token is 32 random bytes written as base64url without padding: 43 characters from A-Z, a-z, 0-9, "-" and "_".
// This is the same pattern the database checks (portal_get_quote and portal_record_view) before it hashes a token,
// so a token that fails here would fail there. Passing this check proves nothing about the link: it only keeps
// malformed input (empty, truncated, padded, base64 with + / =, SQL-looking, not a string) from ever being hashed
// or sent to the database, and gives all of it the same "link not valid" answer.
const PORTAL_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** True only for a string of exactly 43 base64url characters. Anything else, including a non-string, is false. */
export function isPortalToken(value: unknown): value is string {
  // The type check comes first: RegExp.test coerces its argument, so an array or object that prints as a token would pass.
  return typeof value === 'string' && PORTAL_TOKEN.test(value)
}

/** "/q/" and a token wherever it appears in a longer text, such as a portal address inside an email. */
const PORTAL_TOKEN_IN_TEXT = /\/q\/[A-Za-z0-9_-]{43}/g

/**
 * The text with every "/q/" + 43 base64url characters replaced by "/q/redacted", for anything that prints a message
 * which may carry a portal link (the email transport's log mode). "/q/<token>/pdf" becomes "/q/redacted/pdf".
 */
export function redactPortalTokens(text: string): string {
  return text.replace(PORTAL_TOKEN_IN_TEXT, '/q/redacted')
}
