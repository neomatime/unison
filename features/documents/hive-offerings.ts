// Turns HIVE offerings into what a document picker shows and the line they add.
// Pure and relative-import only so the unit tests can run it (see fields.ts).
import { offeringRandPrice, type HiveOffering } from '../../lib/integrations/hive-offerings.ts'
import type { LineFields } from './fields.ts'
import type { HiveOfferingChoice } from './types.ts'
import type { ChargeKind } from './vocabulary.ts'

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

function billingNote(period: string | null): string | null {
  if (!period) return null
  return period === 'once' ? 'Charged once.' : `Billed per ${period}.`
}

/** The picker's groups, in the order the old rate card used. Unknown kinds fall into "Other HIVE offerings". */
export const HIVE_OFFERING_GROUPS: ReadonlyArray<readonly [kind: string, label: string]> = [
  ['retainer', 'Retainers (monthly fee)'],
  ['retainer_implementation', 'Retainer implementation fees (one-time)'],
  ['project', 'Projects (fixed fee)'],
  ['support', 'Support services (monthly)'],
  ['credit_pack', 'Top-up credits (credit packs, one-time)'],
]

export function groupHiveOfferings(choices: HiveOfferingChoice[]): Array<{ label: string; items: HiveOfferingChoice[] }> {
  const known = new Set(HIVE_OFFERING_GROUPS.map(([kind]) => kind))
  const groups = HIVE_OFFERING_GROUPS.map(([kind, label]) => ({ label, items: choices.filter((c) => c.kind === kind && c.price !== null) }))
  groups.push({ label: 'Other HIVE offerings', items: choices.filter((c) => !known.has(c.kind) && c.price !== null) })
  return groups.filter((group) => group.items.length > 0)
}

// The old rate card called the first three tiers "<name> Partner" and the top one "HIMARK Reserve".
// HIVE sends the plan name only, so the suffix is added by plan code, once, here.
const PARTNER_TIERS = new Set(['signature', 'growth', 'private'])

function tierName(offering: HiveOffering): string {
  const name = offering.name.replace(/ implementation$/i, '')
  const code = offering.key.split(':')[1] ?? ''
  return PARTNER_TIERS.has(code) && !/partner/i.test(name) ? `${name} Partner` : name
}

/** The name a project or retainer goes by on a document, for example "Signature Partner" or "Digital Presence". */
export function hiveOfferingDisplayName(offering: HiveOffering): string {
  return offering.kind === 'retainer' ? tierName(offering) : offering.name
}

function credit(offering: HiveOffering, field: 'amount' | 'minimum'): number | null {
  const value = (offering.credits as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === 'number' ? value : null
}

/** The wording of a line (and the picker's option) for an offering, matching the old rate card lines. */
export function hiveOfferingWording(offering: HiveOffering): { title: string; description: string | null } {
  const note = offering.description ? ` ${offering.description}` : ''
  switch (offering.kind) {
    case 'retainer': {
      const credits = credit(offering, 'amount')
      return { title: `${tierName(offering)}: monthly retainer`, description: credits === null ? null : `Includes ${credits} credits a month.` }
    }
    case 'retainer_implementation': {
      const credits = credit(offering, 'amount')
      return {
        title: `${tierName(offering)}: one-time implementation`,
        description: `Charged once at activation.${credits === null ? '' : ` Includes ${credits} one-time implementation credits.`}`,
      }
    }
    case 'project': {
      const credits = credit(offering, 'minimum')
      return { title: `${offering.name}: project`, description: `Fixed-scope project fee.${credits === null ? '' : ` Includes ${credits} implementation credits.`}` }
    }
    case 'support': {
      const credits = credit(offering, 'amount')
      return { title: `${offering.name}: monthly`, description: `${credits === null ? '' : `Includes ${credits} credits a month.`}${note}`.trim() || null }
    }
    default: {
      const parts = [offering.description, billingNote(offering.price.billingPeriod), creditsLabel(offering) ? `Includes ${creditsLabel(offering)}.` : null]
        .filter((part): part is string => Boolean(part))
      return { title: offering.name, description: parts.length ? parts.join('\n') : null }
    }
  }
}

export function toHiveOfferingChoice(offering: HiveOffering): HiveOfferingChoice {
  return {
    key: offering.key,
    kind: offering.kind,
    name: offering.name,
    title: hiveOfferingWording(offering).title,
    description: offering.description ?? null,
    price: offeringRandPrice(offering),
    billingPeriod: offering.price.billingPeriod,
    credits: creditsLabel(offering),
  }
}

/** A retainer or a support service is charged every month, and so is any offering HIVE bills per month; everything else (implementation fees, projects, credit packs) is charged once. */
export function chargeKindForOffering(offering: HiveOffering): ChargeKind {
  if (offering.kind === 'retainer' || offering.kind === 'support' || offering.price.billingPeriod === 'month') return 'monthly'
  return 'once_off'
}

/** Only active offerings with a binding rand price can become a line; HIVE gives projects a credit range, never a rand price. */
export function hiveOfferingToLine(offering: HiveOffering): LineFields | null {
  if (offering.status !== 'active') return null
  const price = offeringRandPrice(offering)
  if (price === null) return null
  const wording = hiveOfferingWording(offering)
  return {
    title: wording.title.slice(0, 200),
    description: wording.description?.slice(0, 2000) ?? null,
    quantity: 1,
    unit_price: price,
    vat_code: 'standard',
    charge_kind: chargeKindForOffering(offering),
  }
}
