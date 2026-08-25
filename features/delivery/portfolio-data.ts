import type { CollectionRecord } from '@/features/product-ui/components/record-collection-workspace'

export const portfolios: CollectionRecord[] = [
  { id: 'strategic-transformation', name: 'Strategic Transformation Portfolio', code: 'PORT-001', context: 'Enterprise change and digital service modernisation', owner: 'Neo Morake', sponsor: 'HIMARK Executive Committee', status: 'Active', health: 'Watch', framework: 'Enterprise Delivery', businessUnit: 'Transformation Office', projects: '14', benefits: 'R18.4M', updated: 'Today' },
  { id: 'customer-experience', name: 'Customer Experience Portfolio', code: 'PORT-002', context: 'Customer journeys, channels and service improvements', owner: 'Amara Dlamini', sponsor: 'Chief Customer Officer', status: 'Active', health: 'On Track', framework: 'Digital Transformation', businessUnit: 'Customer Experience', projects: '9', benefits: 'R11.2M', updated: 'Yesterday' },
  { id: 'operational-resilience', name: 'Operational Resilience Portfolio', code: 'PORT-003', context: 'Operational control, compliance and platform resilience', owner: 'Thabo Mokoena', sponsor: 'Chief Operating Officer', status: 'Under Review', health: 'At Risk', framework: 'Business / Technology Change', businessUnit: 'Operations', projects: '7', benefits: 'R6.8M', updated: '3 days ago' },
]

export const programmes: CollectionRecord[] = [
  { id: 'claims-modernisation', name: 'Claims Modernisation Programme', code: 'PRG-014', context: 'Modernise intake, validation and customer communication', owner: 'Naledi Maseko', sponsor: 'Neo Morake', status: 'In Delivery', health: 'At Risk', projects: '5', start: '12 Feb 2026', end: '30 Nov 2026', updated: 'Today' },
  { id: 'digital-onboarding', name: 'Digital Onboarding Programme', code: 'PRG-018', context: 'A governed digital onboarding experience across client segments', owner: 'Amara Dlamini', sponsor: 'Neo Morake', status: 'In Delivery', health: 'On Track', projects: '4', start: '01 Apr 2026', end: '15 Dec 2026', updated: 'Yesterday' },
  { id: 'policy-control', name: 'Policy Control Programme', code: 'PRG-021', context: 'Policy documentation, controls and evidence management', owner: 'Mia Daniels', sponsor: 'Zanele Khumalo', status: 'Planning', health: 'Watch', projects: '3', start: '01 Sep 2026', end: '30 Jun 2027', updated: '4 days ago' },
]

export const portfolioMembers: CollectionRecord[] = [
  { id: 'neo-morake', name: 'Neo Morake', context: 'Portfolio Owner', owner: 'Transformation Office', status: 'Owner', access: 'Full access', updated: 'Today' },
  { id: 'zanele-khumalo', name: 'Zanele Khumalo', context: 'Executive Sponsor', owner: 'Executive Committee', status: 'Sponsor', access: 'Approve & review', updated: '2 days ago' },
  { id: 'amara-dlamini', name: 'Amara Dlamini', context: 'Programme Director', owner: 'Delivery Office', status: 'Member', access: 'Contribute', updated: 'Today' },
]

export const portfolioBenefits: CollectionRecord[] = [
  { id: 'claims-cycle-time', name: 'Reduce claims cycle time', context: 'Average end-to-end claims processing time', owner: 'Naledi Maseko', status: 'On Track', baseline: '9.4 days', target: '5.0 days', forecast: '5.6 days', progress: '76%', updated: 'Yesterday' },
  { id: 'digital-adoption', name: 'Increase digital adoption', context: 'Customer interactions completed through digital channels', owner: 'Amara Dlamini', status: 'Watch', baseline: '38%', target: '75%', forecast: '68%', progress: '62%', updated: '3 days ago' },
]

export const portfolioRisks: CollectionRecord[] = [
  { id: 'vendor-capacity', name: 'Critical vendor capacity', context: 'Specialist integration capacity may delay two releases', owner: 'Lethabo Nkosi', status: 'Escalated', probability: 'High', impact: 'High', rating: 'Critical', updated: 'Today' },
  { id: 'change-saturation', name: 'Change saturation', context: 'Operational teams have overlapping readiness commitments', owner: 'Amara Dlamini', status: 'Mitigating', probability: 'Medium', impact: 'High', rating: 'High', updated: 'Yesterday' },
]
