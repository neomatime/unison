// Client for the HIVE Origin offering feed (HIVE: docs/integrations/unison-offerings-api.md).
// HIVE is the authority for what can be sold; UNISON reads, never edits.
//
// Server-only by use: it reads a secret key. The fetch is injectable so unit
// tests need no network. Unknown fields are kept (looseObject) so a newer HIVE
// does not break UNISON, and an unsupported major schemaVersion is refused.

import { z } from 'zod'

import { readHiveOfferingsEnv } from '../env.ts'

export const SUPPORTED_SCHEMA_MAJOR = 1

const priceSchema = z.looseObject({
  model: z.string(),
  currency: z.string().nullable(),
  amount: z.number().nullable(),
  billingPeriod: z.string().nullable(),
  binding: z.boolean(),
  reason: z.string().optional(),
})

const offeringSchema = z.looseObject({
  key: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  status: z.string(),
  price: priceSchema,
  credits: z.looseObject({ unit: z.string() }).nullish(),
  projectLimit: z.number().nullish(),
  entitlements: z.array(z.unknown()).optional(),
})

export const hiveOfferingsFeedSchema = z.looseObject({
  schemaVersion: z.string().regex(/^\d+(\.\d+)*$/),
  source: z.string(),
  workspace: z.looseObject({ key: z.string(), name: z.string() }),
  offerings: z.array(offeringSchema),
  generatedAt: z.string(),
  revision: z.string(),
})

export type HiveOffering = z.infer<typeof offeringSchema>
export type HiveOfferingsFeed = z.infer<typeof hiveOfferingsFeedSchema>

export class HiveOfferingsError extends Error {
  readonly reason: 'unavailable' | 'unauthorized' | 'invalid' | 'unsupported_version'
  constructor(reason: HiveOfferingsError['reason'], message: string) {
    super(message)
    this.name = 'HiveOfferingsError'
    this.reason = reason
  }
}

/** Validates a decoded feed body. Throws HiveOfferingsError, never returns a partial feed. */
export function parseHiveOfferingsFeed(body: unknown): HiveOfferingsFeed {
  const version = (body as { schemaVersion?: unknown } | null)?.schemaVersion
  if (typeof version === 'string' && Number.parseInt(version, 10) !== SUPPORTED_SCHEMA_MAJOR) {
    throw new HiveOfferingsError('unsupported_version', `HIVE offerings schema ${version} is not supported.`)
  }
  const parsed = hiveOfferingsFeedSchema.safeParse(body)
  if (!parsed.success) throw new HiveOfferingsError('invalid', 'The HIVE offerings feed has an unexpected shape.')
  return parsed.data
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type FetchHiveOfferingsOptions = {
  env?: Record<string, string | undefined>
  fetch?: FetchLike
  timeoutMs?: number
}

export async function fetchHiveOfferings(options: FetchHiveOfferingsOptions = {}): Promise<HiveOfferingsFeed> {
  const { HIVE_OFFERINGS_URL, HIVE_OFFERINGS_API_KEY } = readHiveOfferingsEnv(options.env ?? process.env)
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))

  let response: Response
  try {
    response = await doFetch(HIVE_OFFERINGS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${HIVE_OFFERINGS_API_KEY}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual', // a redirect to /login means HIVE did not accept the request; never follow it with the key
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    })
  } catch {
    throw new HiveOfferingsError('unavailable', 'HIVE offerings could not be reached.')
  }

  if (response.status === 401) throw new HiveOfferingsError('unauthorized', 'HIVE rejected the offerings key.')
  if (!response.ok) throw new HiveOfferingsError('unavailable', `HIVE offerings returned ${response.status}.`)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new HiveOfferingsError('invalid', 'The HIVE offerings feed was not JSON.')
  }
  return parseHiveOfferingsFeed(body)
}

/** A retainer or project price UNISON may show in rand. Credit-range projects have none, by HIVE's rule. */
export function offeringRandPrice(offering: HiveOffering): number | null {
  const { price } = offering
  if (!price.binding || price.currency !== 'ZAR' || price.amount === null) return null
  return price.amount
}
