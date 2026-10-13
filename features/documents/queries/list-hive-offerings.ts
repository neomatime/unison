import 'server-only'

import { HiveOfferingsError, fetchHiveOfferings } from '@/lib/integrations/hive-offerings'
import { toHiveOfferingChoice } from '../hive-offerings'
import type { HiveOfferingsResult } from '../types'

/** The HIVE offering catalogue for the picker. Never throws: when HIVE is unreachable the page still renders and the picker says why. */
export async function listHiveOfferings(): Promise<HiveOfferingsResult> {
  try {
    const feed = await fetchHiveOfferings()
    return { offerings: feed.offerings.filter((offering) => offering.status === 'active').map(toHiveOfferingChoice), error: null }
  } catch (error) {
    const reason = error instanceof HiveOfferingsError ? error.reason : 'unavailable'
    console.error('[hive-offerings] feed unavailable', { reason })
    const message = error instanceof Error && error.name === 'MissingEnvError'
      ? 'HIVE offerings are not configured for this environment.'
      : 'HIVE offerings are unavailable right now. Try again shortly.'
    return { offerings: [], error: message }
  }
}
