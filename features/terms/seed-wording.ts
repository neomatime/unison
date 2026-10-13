// The terms loaded for the HIMARK organisation by supabase/migrations/20261012161000_commercial_terms_seed.sql, as
// approved version 1 effective 2026-10-12. The wording is HIMARK's (from the terms brief). Fees, credits and the number
// of active initiatives are placeholders, filled from HIVE Origin's retainer plans when the terms are previewed.
// No imports from the framework: unit tests use it directly.

// The names and keys the seed used. They are fixed: the seed migration has already been applied with exactly these.
const RETAINER_NAMES: Record<string, string> = {
  signature: 'Signature Partner',
  growth: 'Growth Partner',
  private: 'Private Partner',
  reserve: 'HIMARK Reserve',
}
const PROJECT_NAMES: Record<string, string> = {
  operating_model: 'Operating Model & Operations Transformation',
  intelligence_ai: 'Intelligence & AI Transformation',
  digital_experience: 'Digital Experience',
  digital_presence: 'Digital Presence',
  visual_communication: 'Visual Communication & Operations',
}
const SUPPORT_SERVICES: ReadonlyArray<readonly [key: string, title: string]> = [
  ['operations_improvement', 'Operations Improvement Support'],
  ['ai_automation_care', 'AI & Automation Care'],
  ['digital_experience_management', 'Digital Experience Management'],
  ['application_interface_care', 'Application & Interface Care'],
  ['digital_presence_management', 'Digital Presence Management'],
  ['website_care', 'Website Care'],
  ['communication_asset_care', 'Communication & Asset Care'],
  ['podcast_content', 'Podcast Content'],
  ['integrated_podcast_social', 'Integrated Podcast & Social Media Content'],
  ['social_media_content', 'Social Media Content'],
]
const packageName = (key: string) => RETAINER_NAMES[key] ?? PROJECT_NAMES[key] ?? key

export const SEED_EFFECTIVE_FROM = '2026-10-12'

/** The two company-wide templates. Their wording is copied from the organisation's existing default terms when the seed runs. */
export const COMPANY_SEED = [
  { appliesTo: 'quote', title: 'Company terms: quotes' },
  { appliesTo: 'invoice', title: 'Company terms: invoices' },
] as const

export type SeedTemplate = {
  targetKind: 'retainer' | 'project' | 'support'
  targetKey: string
  appliesTo: 'quote'
  title: string
  body: string
  inclusions: string
}

const lines = (...items: string[]) => items.join('\n')

const RETAINERS: Array<{ key: string; body: string; inclusions: string }> = [
  {
    key: 'signature',
    body: lines(
      'Signature Partner provides focused strategic advisory and transformation support for up to {{initiative_limit}} agreed active business priorities.',
      'The partnership includes a dedicated HIMARK Engagement Lead, an agreed improvement roadmap, applicable TRACE assessments, fortnightly working sessions and monthly executive progress reviews.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'The included monthly credits are not separately invoiced.',
      'One-time onboarding or implementation work is scoped, approved and priced separately where applicable.',
      'Additional credits or work beyond the agreed scope require prior client approval and separate billing.',
      'Specialist access, delivery capacity and priorities remain subject to the agreement.',
      'Unused-credit treatment, contract duration and termination conditions follow the signed agreement.',
    ),
    inclusions: lines('Dedicated HIMARK Engagement Lead', 'Agreed improvement roadmap', 'Applicable TRACE assessments', 'Fortnightly working sessions', 'Monthly executive progress reviews'),
  },
  {
    key: 'growth',
    body: lines(
      'Growth Partner provides strategic coordination and transformation support for up to {{initiative_limit}} agreed active initiatives.',
      'HIMARK provides a dedicated Engagement Lead, a coordinated transformation roadmap, relevant TRACE monitoring, priority specialist access, implementation coordination, weekly working sessions and monthly executive governance.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included monthly credits must not be invoiced again.',
      'Substantial implementation and onboarding work is scoped and charged separately where applicable.',
      'Additional credits and approved scope changes are billed separately.',
      'Delivery commitments, credit treatment, contract duration and termination follow the signed agreement.',
    ),
    inclusions: lines('Dedicated Engagement Lead', 'Coordinated transformation roadmap', 'Relevant TRACE monitoring', 'Priority specialist access', 'Implementation coordination', 'Weekly working sessions', 'Monthly executive governance'),
  },
  {
    key: 'private',
    body: lines(
      "Private Partner provides embedded strategic transformation support alongside the client's leadership team for up to {{initiative_limit}} agreed active initiatives.",
      'The partnership includes a dedicated Account Director, a 12-month transformation agenda, multi-function TRACE assessments, executive reporting, vendor coordination and priority or reserved specialist access as agreed.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included monthly credits are not charged separately.',
      'Major implementation, onboarding and specialist projects outside the agreed scope require separate approval and pricing.',
      'Reserved access does not constitute unlimited delivery capacity.',
      'Credit rules, agreement duration, confidentiality obligations and termination conditions follow the executed agreement.',
    ),
    inclusions: lines('Dedicated Account Director', '12-month transformation agenda', 'Multi-function TRACE assessments', 'Executive reporting', 'Vendor coordination', 'Priority or reserved specialist access as agreed'),
  },
  {
    key: 'reserve',
    body: lines(
      'HIMARK Reserve provides enterprise-wide strategic transformation support and access to reserved HIMARK capability.',
      'The engagement includes an Account Director, HIMARK Executive Sponsor, enterprise transformation oversight, reserved specialist capacity, relevant TRACE assessments and executive or board-level reporting as agreed.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included credits must not be billed a second time.',
      'Additional enterprise initiatives, major implementation and work outside approved capacity require separate scope and commercial approval.',
      'Reserved-priority mobilisation is governed by the agreed capacity and delivery commitments.',
      'Confidentiality, credit availability, contract duration, service limitations and termination follow the executed agreement.',
    ),
    inclusions: lines('Account Director', 'HIMARK Executive Sponsor', 'Enterprise transformation oversight', 'Reserved specialist capacity', 'Relevant TRACE assessments', 'Executive or board-level reporting as agreed'),
  },
]

const PROJECT_TERMS: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'strategic_consulting',
    title: 'Strategic Consulting',
    body: lines(
      'The engagement covers the specific strategic advisory deliverables described in the approved scope of work.',
      'Discovery, research, recommendations and agreed strategy documents are delivered according to the approved project plan.',
      'Client input, access to relevant stakeholders and timely feedback may be required.',
      'Additional strategic initiatives or ongoing advisory support are excluded unless contracted separately.',
    ),
  },
  {
    key: 'operating_model',
    title: packageName('operating_model'),
    body: lines(
      'Delivery is limited to the approved operational processes, business functions and improvement objectives.',
      'The client provides necessary operational information, system access and stakeholder participation.',
      'Changes affecting additional departments, systems or agreed requirements are subject to change approval.',
      'Ongoing operational management or improvement support is contracted separately where required.',
    ),
  },
  {
    key: 'intelligence_ai',
    title: packageName('intelligence_ai'),
    body: lines(
      'The engagement covers the agreed AI, automation or intelligence solution and its documented scope.',
      'Deployment, integrations, data access, testing and acceptance requirements must be agreed before implementation.',
      'Third-party AI usage, hosting, API access and subscription fees are separately identified unless included in the quotation.',
      'Performance monitoring, future model changes, maintenance and additional functionality are governed by the applicable support or change agreement.',
      'Client data handling, security and access requirements must be established in the approved project documentation.',
    ),
  },
  {
    key: 'digital_experience',
    title: packageName('digital_experience'),
    body: lines(
      'Delivery includes only the agreed digital experience, UX/UI, product design or application deliverables.',
      'Design approvals, revision allowances, device coverage and acceptance requirements are defined by the approved scope.',
      'New features, additional screens or additional development require separate approval.',
      'Post-delivery application or interface care is not included unless expressly contracted.',
    ),
  },
  {
    key: 'digital_presence',
    title: packageName('digital_presence'),
    body: lines(
      'Delivery covers the agreed website, branding or digital presence deliverables.',
      'The approved sitemap, pages, features, integrations and content responsibilities define the scope.',
      'Hosting, domain registration, licences and external subscriptions are included only where expressly itemised.',
      'New functionality, additional pages and post-launch maintenance require an approved scope or separate care agreement.',
      'Launch and handover follow the agreed client acceptance requirements.',
    ),
  },
  {
    key: 'visual_communication',
    title: packageName('visual_communication'),
    body: lines(
      'Delivery covers the approved visual communication, podcast, social media or executive communication deliverables.',
      'The quotation must identify quantities, formats, platforms, production responsibilities and revision limits.',
      'Studio hire, travel, recording equipment, external talent, paid media and other production expenses are included only where expressly stated.',
      'Additional episodes, content assets, revisions or campaigns require separate approval.',
      'Intellectual-property usage, publishing permissions and third-party materials are governed by the applicable agreed terms.',
    ),
  },
]


export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  ...RETAINERS.map((item): SeedTemplate => ({
    targetKind: 'retainer', targetKey: item.key, appliesTo: 'quote', title: packageName(item.key), body: item.body, inclusions: item.inclusions,
  })),
  ...PROJECT_TERMS.map((item): SeedTemplate => ({
    targetKind: 'project', targetKey: item.key, appliesTo: 'quote', title: item.title, body: item.body, inclusions: '',
  })),
  ...SUPPORT_SERVICES.map(([key, title]): SeedTemplate => ({
    targetKind: 'support', targetKey: key, appliesTo: 'quote', title, body: '', inclusions: '',
  })),
]

if (!Object.keys(PROJECT_NAMES).every((key) => PROJECT_TERMS.some((item) => item.key === key))) {
  throw new Error('Every project needs seed terms.')
}
