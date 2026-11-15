// The people invited to an event. Pure: no directive, no imports, so the tests load it directly.

/** `optional` is true for someone invited as an optional attendee; otherwise they are required. */
export type Attendee = { name: string; email: string; optional?: boolean }
export const MAX_ATTENDEES = 50

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/

export const isEmail = (value: string): boolean => value.length <= 254 && EMAIL.test(value.trim())

/** Reads attendees from JSON text or an array: entries without a valid email are dropped, addresses are lower-cased and
 *  repeated addresses are kept once, and there are at most 50. */
export function parseAttendees(value: unknown): Attendee[] {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const seen = new Map<string, number>()
  const out: Attendee[] = []
  for (const entry of list) {
    const record = (entry && typeof entry === 'object' ? entry : {}) as { name?: unknown; email?: unknown }
    const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
    if (!isEmail(email)) continue
    const optional = (entry as { optional?: unknown }).optional === true
    const at = seen.get(email)
    if (at !== undefined) {
      // Listed twice: required wins over optional.
      if (!optional) out[at] = { name: out[at].name, email: out[at].email }
      continue
    }
    seen.set(email, out.length)
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 120) : ''
    out.push(optional ? { name: name || email, email, optional: true } : { name: name || email, email })
    if (out.length === MAX_ATTENDEES) break
  }
  return out
}

/** A person someone can be invited from: a team member or a client's contact. */
export type Person = { name: string; email: string; group: string }

/** The people that match what was typed (name, email or group), not already invited, best matches first. */
export function suggestPeople(people: readonly Person[], query: string, invited: readonly Attendee[], limit = 8): Person[] {
  const taken = new Set(invited.map((attendee) => attendee.email.toLowerCase()))
  const needle = query.trim().toLowerCase()
  return people
    .filter((person) => !taken.has(person.email.toLowerCase()))
    .filter((person) => !needle || `${person.name} ${person.email} ${person.group}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
