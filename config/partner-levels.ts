// Commercial partner levels. Separate from the module tiers in unison-tiers.ts:
// the tier decides which modules a client gets, the partner level says which
// commercial relationship (and price) they are on. Prices are fixed per level, in
// rand, and live here rather than in the database so there is one place to change them.

export const partnerLevels = [
  { id: 'signature', label: 'Signature Partner', price: 100_000 },
  { id: 'growth', label: 'Growth Partner', price: 150_000 },
  { id: 'private', label: 'Private Partner', price: 200_000 },
  { id: 'reserve', label: 'HIMARK Reserve', price: 300_000 },
] as const

export type PartnerLevelId = (typeof partnerLevels)[number]['id']
export const PARTNER_PRICE_CURRENCY = 'ZAR'
export const partnerLevelIds = partnerLevels.map((level) => level.id) as [PartnerLevelId, ...PartnerLevelId[]]

export function getPartnerLevel(id: string | null | undefined) {
  return partnerLevels.find((level) => level.id === id) ?? null
}
