const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ClientFeedQuery =
  | { ok: true; updatedSince: string | null; cursor: string | null; limit: number }
  | { ok: false; error: string }

export function parseClientFeedQuery(params: URLSearchParams): ClientFeedQuery {
  const since = params.get('updated_since')
  let updatedSince: string | null = null
  if (since) {
    const time = Date.parse(since)
    if (Number.isNaN(time)) return { ok: false, error: 'updated_since must be an ISO date.' }
    updatedSince = new Date(time).toISOString()
  }
  const cursor = params.get('cursor')
  if (cursor && !UUID.test(cursor)) return { ok: false, error: 'cursor is not valid.' }
  const rawLimit = params.get('limit')
  let limit = 100
  if (rawLimit !== null) {
    limit = Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return { ok: false, error: 'limit must be between 1 and 500.' }
    }
  }
  return { ok: true, updatedSince, cursor: cursor || null, limit }
}
