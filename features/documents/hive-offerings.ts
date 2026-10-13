// Turns HIVE offerings into what a document picker shows and the line they add.
// Pure and relative-import only so the unit tests can run it (see fields.ts).
import { offeringRandPrice, type HiveOffering } from '../../lib/integrations/hive-offerings.ts'
import type { LineFields } from './fields.ts'
import type { HiveOfferingChoice } from './types.ts'

function creditsLabel(offering: HiveOffering): string | null {
  const credits = offering.credits as Record<string, unknown> | null | undefined
  if (!credits) return null
  const unit = typeof credits.unit === 'string' ? credits.unit : ''
  if (typeof credits.amount === 'number') return `${credits.amount} credits${unit ? ` a ${unit}` : ''}`
  if (typeof credits.minimum === 'number' && typeof credits.maximum === 'number') {
    return `${credits.minimum} to ${credits.maximum} credits${unit ? ` per ${unit}` : ''}`
  }
  return null
}

export function toHiveOfferingChoice(offering: HiveOffering): HiveOfferingChoice {
  return {
    key: offering.key,
    kind: offering.kind,
    name: offering.name,
    description: offering.description ?? null,
    price: offeringRandPrice(offering),
    billingPeriod: offering.price.billingPeriod,
    credits: creditsLabel(offering),
  }
}

/** Only active offerings with a binding rand price can become a line; HIVE gives projects a credit range, never a rand price. */
export function hiveOfferingToLine(offering: HiveOffering): LineFields | null {
  if (offering.status !== 'active') return null
  const price = offeringRandPrice(offering)
  if (price === null) return null
  const choice = toHiveOfferingChoice(offering)
  const parts = [
    choice.description,
    choice.billingPeriod ? `Billed per ${choice.billingPeriod}.` : null,
    choice.credits ? `Includes ${choice.credits}.` : null,
  ].filter((part): part is string => Boolean(part))
  return {
    title: offering.name.slice(0, 200),
    description: parts.length ? parts.join('\n').slice(0, 2000) : null,
    quantity: 1,
    unit_price: price,
    vat_code: 'standard',
    price_list_item_id: null,
  }
}
