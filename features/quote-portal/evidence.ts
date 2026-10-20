// The evidence a decision keeps of where it came from: the client's IP address and user agent, read from the request
// headers. Pure apart from node:net: no directive, no '@/', so unit tests can load it.
//
// Evidence only. A value that is missing or is not what it claims to be is dropped (null), never a reason to refuse a
// decision. portal_decide also drops an address over 64 characters and cuts the user agent to 300; doing both here
// means what is stored is exactly what was checked.
import { isIP } from 'node:net'

/** The most of the user agent kept, in characters: the database's own cut (quote_responses.user_agent). */
const USER_AGENT_MAX = 300

/**
 * - ip: the first entry of x-forwarded-for (the client, as the hosting proxy records it), or x-real-ip when that is
 *   absent or its first entry is empty; trimmed, and kept only when node:net isIP says it is an IPv4 or IPv6 address.
 *   A port, brackets, "unknown" or anything else is null, and a first entry that is not an address does not fall
 *   through to x-real-ip.
 * - userAgent: the user-agent header, cut to its first 300 characters (whole characters, as the database counts them,
 *   so a character is never cut in half), or null when there is none.
 *
 * `get` reads one request header by name and gives null when it is absent, as Headers.get does.
 */
export function readEvidence(get: (name: string) => string | null): { ip: string | null; userAgent: string | null } {
  const forwarded = (get('x-forwarded-for') ?? '').split(',', 1)[0]?.trim() ?? ''
  const candidate = forwarded || (get('x-real-ip') ?? '').trim()
  const agent = get('user-agent')
  return {
    ip: candidate !== '' && isIP(candidate) !== 0 ? candidate : null,
    userAgent: agent ? Array.from(agent).slice(0, USER_AGENT_MAX).join('') : null,
  }
}
