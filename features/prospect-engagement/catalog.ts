export const FORM_VERSION = '1.0'
export const PRIVACY_NOTICE_VERSION = '2026-11'

export const SERVICE_IDS = [
  'consulting',
  'technology-development',
  'vesper',
  'multimedia-creative',
  'strategic-partnership',
  'not-sure',
] as const

export type ServiceId = (typeof SERVICE_IDS)[number]

export type ServiceDefinition = {
  id: ServiceId
  label: string
  description: string
  icon: 'briefcase' | 'code' | 'mountain' | 'film' | 'handshake' | 'compass'
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    id: 'consulting',
    label: 'Consulting',
    description: 'Operational improvement, business processes, people and strategic transformation.',
    icon: 'briefcase',
  },
  {
    id: 'technology-development',
    label: 'Technology Development',
    description: 'Custom software, digital solutions, system integration and automation.',
    icon: 'code',
  },
  {
    id: 'vesper',
    label: 'VESPER',
    description: "Explore HIMARK's integrated Mining Operating System.",
    icon: 'mountain',
  },
  {
    id: 'multimedia-creative',
    label: 'Multimedia & Creative',
    description: 'Brand storytelling, cinematic production and creative solutions.',
    icon: 'film',
  },
  {
    id: 'strategic-partnership',
    label: 'Strategic Partnership',
    description: 'Explore a long-term working relationship with HIMARK.',
    icon: 'handshake',
  },
  {
    id: 'not-sure',
    label: "I'm Not Sure Yet",
    description: 'Help me explore the right solution for my organisation.',
    icon: 'compass',
  },
] as const

export const OBJECTIVES = {
  consulting: [
    ['improve-operational-efficiency', 'Improve operational efficiency.'],
    ['improve-business-processes', 'Improve existing business processes.'],
    ['address-workforce-challenges', 'Address organisational or workforce challenges.'],
    ['improve-technology-adoption', 'Improve technology adoption.'],
    ['resolve-strategic-challenges', 'Resolve operational or strategic challenges.'],
    ['explore-business-improvement', 'Explore opportunities for business improvement.'],
  ],
  'technology-development': [
    ['develop-new-application', 'Develop a new software application.'],
    ['modernise-existing-system', 'Improve or modernise an existing system.'],
    ['connect-systems-data', 'Connect existing systems and data.'],
    ['automate-business-processes', 'Automate business processes.'],
    ['improve-digital-operations', 'Improve digital operations.'],
    ['explore-technology-solutions', 'Explore possible technology solutions.'],
  ],
  vesper: [
    ['improve-mining-operations', 'Improve daily mining operations.'],
    ['improve-field-visibility', 'Improve field reporting and operational visibility.'],
    ['improve-shift-coordination', 'Improve shift coordination and handovers.'],
    ['improve-equipment-readiness', 'Improve equipment readiness and downtime visibility.'],
    ['understand-vesper', "Understand VESPER's capabilities."],
    ['request-vesper-demo', 'Request a VESPER demonstration.'],
  ],
  'multimedia-creative': [
    ['communicate-organisation-story', "Communicate our organisation's story."],
    ['strengthen-brand', 'Develop or strengthen our brand.'],
    ['produce-cinematic-content', 'Produce cinematic corporate content.'],
    ['develop-creative-campaigns', 'Develop marketing and creative campaigns.'],
    ['improve-organisational-communication', 'Improve organisational communication.'],
    ['explore-creative-partnership', 'Explore a long-term creative partnership.'],
  ],
  'strategic-partnership': [
    ['ongoing-advisory-support', 'Ongoing consulting and advisory support.'],
    ['long-term-technology-support', 'Long-term technology support.'],
    ['operational-improvement', 'Operational improvement.'],
    ['integrated-partnership', 'An integrated consulting and creative partnership.'],
    ['broader-strategic-relationship', 'Explore a broader strategic relationship.'],
  ],
  'not-sure': [
    ['improve-organisation-operations', 'We want to improve how our organisation operates.'],
    ['explore-technology-opportunities', 'We are exploring technology opportunities.'],
    ['strengthen-brand-communications', 'We want to strengthen our brand and communications.'],
    ['discuss-business-challenge', 'We have a business challenge to discuss.'],
    ['prefer-guidance', 'We would prefer guidance from HIMARK.'],
  ],
} as const satisfies Record<ServiceId, readonly (readonly [string, string])[]>

export const TIMELINES = [
  ['as-soon-as-possible', 'As soon as possible.'],
  ['within-1-3-months', 'Within 1–3 months.'],
  ['within-3-6-months', 'Within 3–6 months.'],
  ['exploring', 'Just exploring for now.'],
] as const

export const INDUSTRIES = [
  ['mining-resources', 'Mining & Resources'],
  ['financial-services', 'Financial Services'],
  ['healthcare', 'Healthcare'],
  ['other', 'Other'],
] as const

export const CONTACT_PREFERENCES = [
  ['email', 'Email'],
  ['telephone', 'Telephone'],
] as const

export const ACQUISITION_CHANNELS = [
  ['corporate-website', 'Corporate Website'],
  ['qr-code', 'QR Code'],
  ['direct-invitation', 'Direct Invitation'],
  ['email-signature', 'Email Signature'],
  ['marketing-campaign', 'Marketing Campaign'],
  ['referral', 'Referral'],
  ['business-development', 'Business Development / In-Person Engagement'],
] as const

export const COUNTRIES = [
  'South Africa',
  'Botswana',
  'Eswatini',
  'Lesotho',
  'Mozambique',
  'Namibia',
  'Zambia',
  'Zimbabwe',
  'Kenya',
  'Nigeria',
  'Ghana',
  'United Kingdom',
  'United States',
  'United Arab Emirates',
  'Other',
] as const

export type PublicFormConfig = {
  headline: string
  supportingText: string
  privacyNoticeUrl: string
  privacyNoticeVersion: string
  enabledServices: ServiceId[]
}

export const DEFAULT_FORM_CONFIG: PublicFormConfig = {
  headline: "Let's explore a partnership.",
  supportingText: "Tell us what you're looking to achieve. A few quick steps will help us understand how HIMARK can support your organisation.",
  privacyNoticeUrl: 'https://himark.co.za/privacy',
  privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
  enabledServices: [...SERVICE_IDS],
}

export const labelForService = (id: string) => SERVICES.find((service) => service.id === id)?.label ?? id

export const labelForObjective = (service: ServiceId, id: string) =>
  OBJECTIVES[service].find(([value]) => value === id)?.[1] ?? id

export const labelForTimeline = (id: string) => TIMELINES.find(([value]) => value === id)?.[1] ?? id

export const labelForIndustry = (id: string) => INDUSTRIES.find(([value]) => value === id)?.[1] ?? id

