// The HIMARK rate card (HIMARK_Pricing_2026_Unified_Billing_Model.xlsx). All prices are rand excluding VAT.
// The migration 20261012100000_rate_card.sql seeds exactly these rows; tests/unit/billing-rate-card.test.ts checks it.
// No imports: unit tests and server code both use it.

export type RateKind = 'retainer_monthly' | 'retainer_implementation' | 'retainer_top_up' | 'project' | 'project_top_up' | 'support'
export type RateStatus = 'agreed' | 'proposed'
export type RateItem = {
  key: string
  kind: RateKind
  packageKey: string | null
  title: string
  description: string
  price: number
  credits: number | null
  status: RateStatus
  initiativeLimit: number | null
}

export const TIERS = [
  { key: 'signature', name: 'Signature Partner' },
  { key: 'growth', name: 'Growth Partner' },
  { key: 'private', name: 'Private Partner' },
  { key: 'reserve', name: 'HIMARK Reserve' },
] as const

export const PROJECTS = [
  { key: 'operating_model', name: 'Operating Model & Operations Transformation' },
  { key: 'intelligence_ai', name: 'Intelligence & AI Transformation' },
  { key: 'digital_experience', name: 'Digital Experience' },
  { key: 'digital_presence', name: 'Digital Presence' },
  { key: 'visual_communication', name: 'Visual Communication & Operations' },
] as const

const PROPOSED = 'Proposed rate, not yet agreed.'

// [tier key, monthly fee, credits per month, top-up rate per credit, active projects allowed]
const TIER_ROWS = [
  ['signature', 100000, 40, 2500, 2],
  ['growth', 150000, 75, 2000, 4],
  ['private', 200000, 120, 1666.67, 6],
  ['reserve', 300000, 220, 1363.64, null],
] as const

// [project key, fee, implementation credits]
const PROJECT_ROWS = [
  ['operating_model', 120000, 40],
  ['intelligence_ai', 150000, 50],
  ['digital_experience', 65000, 22],
  ['digital_presence', 45000, 15],
  ['visual_communication', 35000, 12],
] as const

// [service key, title, project key, monthly fee, credits per month, note]
const SUPPORT_ROWS = [
  ['operations_improvement', 'Operations Improvement Support', 'operating_model', 35000, 12, 'Core monthly support.'],
  ['ai_automation_care', 'AI & Automation Care', 'intelligence_ai', 15000, 5, 'Core monthly support.'],
  ['digital_experience_management', 'Digital Experience Management', 'digital_experience', 30000, 10, 'Core monthly support.'],
  ['application_interface_care', 'Application & Interface Care', 'digital_experience', 10000, 3, 'Optional monthly care.'],
  ['digital_presence_management', 'Digital Presence Management', 'digital_presence', 20000, 7, 'Core monthly support.'],
  ['website_care', 'Website Care', 'digital_presence', 5000, 2, 'Optional monthly care.'],
  ['communication_asset_care', 'Communication & Asset Care', 'visual_communication', 5000, 2, 'Core monthly support.'],
  ['podcast_content', 'Podcast Content', 'visual_communication', 25000, 8, 'Optional monthly content.'],
  ['integrated_podcast_social', 'Integrated Podcast & Social Media Content', 'visual_communication', 40000, 13, 'An alternative to Podcast Content and Social Media Content.'],
  ['social_media_content', 'Social Media Content', 'visual_communication', 20000, 7, 'Optional monthly content.'],
] as const

const tierName = (key: string) => TIERS.find((tier) => tier.key === key)!.name
const projectName = (key: string) => PROJECTS.find((project) => project.key === key)!.name

function build(): RateItem[] {
  const items: RateItem[] = []
  for (const [tier, monthly, credits, topUp, limit] of TIER_ROWS) {
    items.push({
      key: `retainer.${tier}.monthly`, kind: 'retainer_monthly', packageKey: tier,
      title: `${tierName(tier)}: monthly retainer`, description: `Includes ${credits} credits a month.`,
      price: monthly, credits, status: 'agreed', initiativeLimit: limit,
    })
    items.push({
      key: `retainer.${tier}.implementation`, kind: 'retainer_implementation', packageKey: tier,
      title: `${tierName(tier)}: one-time implementation`, description: `Charged once at activation. Includes ${credits} one-time implementation credits.`,
      price: monthly, credits, status: 'agreed', initiativeLimit: null,
    })
    items.push({
      key: `retainer.${tier}.top_up`, kind: 'retainer_top_up', packageKey: tier,
      title: `${tierName(tier)}: top-up credits`, description: `Extra credits, charged per credit. ${PROPOSED}`,
      price: topUp, credits: null, status: 'proposed', initiativeLimit: null,
    })
  }
  for (const [project, fee, credits] of PROJECT_ROWS) {
    items.push({
      key: `project.${project}`, kind: 'project', packageKey: project,
      title: `${projectName(project)}: project`, description: `Fixed-scope project fee. Includes ${credits} implementation credits.`,
      price: fee, credits, status: 'agreed', initiativeLimit: null,
    })
  }
  items.push({
    key: 'project.top_up', kind: 'project_top_up', packageKey: null,
    title: 'Project top-up credits', description: `Extra credits for an approved scope increase, charged per credit. ${PROPOSED}`,
    price: 3000, credits: null, status: 'proposed', initiativeLimit: null,
  })
  for (const [service, title, project, fee, credits, note] of SUPPORT_ROWS) {
    items.push({
      key: `support.${service}`, kind: 'support', packageKey: project,
      title: `${title}: monthly`, description: `Includes ${credits} credits a month. ${note}`,
      price: fee, credits, status: 'agreed', initiativeLimit: null,
    })
  }
  return items
}

export const RATE_CARD: readonly RateItem[] = build()

export function rateItem(key: string): RateItem | undefined {
  return RATE_CARD.find((item) => item.key === key)
}

/** A tier's or project's display name, or the key itself when it is neither. */
export function packageName(packageKey: string): string {
  return TIERS.find((tier) => tier.key === packageKey)?.name ?? PROJECTS.find((project) => project.key === packageKey)?.name ?? packageKey
}
