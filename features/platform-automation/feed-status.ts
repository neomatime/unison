// The sentences staff see about the HIVE client feed on a quote (quote portal, slice 3). Pure, so that node --test loads it.
//
// UNISON can only say whether a client would appear in the feed and when HIVE last read it. What HIVE did with the feed
// is not known here, and nothing below says anything about it.

/** The camelCase form of what get_hive_feed_status returns for one client of the organisation. */
export type HiveFeedStatusInput = {
  gateEnabled: boolean
  hasLiveKey: boolean
  lastReadAt: string | null
  /** Null when the client is not a client of the organisation. */
  client: { included: boolean; since: string | null } | null
}

export type FeedStatusLines = { headline: string; detail: string | null }

const ZONE = 'Africa/Johannesburg'
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: ZONE })
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONE })

/** A time in South African time, or null for a value that is not a time (it must never take a page down). */
const format = (formatter: Intl.DateTimeFormat, value: string | null): string | null => {
  if (value === null) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : formatter.format(date)
}

/**
 * What to tell staff about one client and the feed, or null when there is nothing worth saying: the organisation has no
 * live feed key (nothing reads the feed), or the client is not one of its clients.
 */
export function feedStatusLines(status: HiveFeedStatusInput): FeedStatusLines | null {
  if (!status.hasLiveKey || !status.client) return null

  let headline: string
  if (!status.gateEnabled) {
    headline = 'The HIVE client feed currently includes every client.'
  } else if (status.client.included) {
    headline = `Included in the HIVE client feed since ${format(DATE, status.client.since) ?? 'an unknown date'}.`
  } else {
    headline = 'Not included in the HIVE client feed (no accepted quote).'
  }

  const detail =
    status.lastReadAt === null ? 'HIVE has not read the feed yet.' : `HIVE last read the feed ${format(DATE_TIME, status.lastReadAt) ?? 'at an unknown time'}.`
  return { headline, detail }
}
