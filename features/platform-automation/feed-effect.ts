// What the HIVE client feed gate does to who is in the feed, in words (quote portal, slice 3). Pure, so that node --test loads it.
//
// UNISON can say who is in the feed, who would be, and that it cannot take back what HIVE has already read. What HIVE
// does with a client that leaves the feed is HIVE's behaviour, which UNISON cannot see, so nothing here describes it.

/** Said after every sentence about who is in the feed. It is not said when there are no clients. */
export const FEED_HIVE_NOTE = 'UNISON cannot take back what HIVE has already read; what HIVE does with a client that leaves the feed is up to HIVE.'

export type FeedEffectInput = {
  /** The saved setting: true when the feed already includes only clients with an accepted quote. */
  enabled: boolean
  /** How many clients the organisation has. */
  total: number
  /** How many of them have an accepted quote. */
  accepted: number
}

const clients = (count: number) => `${count} ${count === 1 ? 'client' : 'clients'}`
const have = (count: number) => (count === 1 ? 'has' : 'have')

/**
 * The sentence that says who is in the feed (saved setting on) or who would be (saved setting off). It says plainly when the
 * feed is, or would be, empty: that is the case an administrator most needs to see before switching it on.
 */
export function feedEffectSentence({ enabled, total, accepted }: FeedEffectInput): string {
  if (total === 0) return 'There are no clients yet.'
  const others = total - accepted
  if (enabled) {
    if (accepted === 0) return `The feed is empty: none of your ${clients(total)} ${have(total)} an accepted quote.`
    if (accepted === total) return 'Every client is in the feed.'
    return `Today ${accepted} of ${total} clients have an accepted quote. The other ${others} ${others === 1 ? 'is' : 'are'} not in the feed.`
  }
  if (accepted === 0) return `Today none of your ${clients(total)} ${have(total)} an accepted quote, so turning this on would leave the feed empty.`
  if (accepted === total) return `Today all ${clients(total)} ${have(total)} an accepted quote, so turning this on would not change who is in the feed.`
  return `Today ${accepted} of ${total} clients have an accepted quote. Turning this on removes the other ${others} from the feed.`
}
