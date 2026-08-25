export const deliveryPhases = [
  { name: 'Initiate', projects: 4 },
  { name: 'Discover', projects: 6 },
  { name: 'Design', projects: 5 },
  { name: 'Build', projects: 9 },
  { name: 'Test', projects: 4 },
  { name: 'Ready', projects: 3 },
  { name: 'Deploy', projects: 2 },
  { name: 'Measure', projects: 3 },
] as const

export type DeliveryHealth = 'On Track' | 'At Risk' | 'Critical' | 'Watch' | 'Healthy'

export type DeliveryProject = {
  id: string
  name: string
  framework: string
  phase: string
  health: DeliveryHealth
  owner: string
  nextGate: string
  dueDate: string
  progress: number
  blockers: number
  dependencies: number
}

export const deliveryProjects: DeliveryProject[] = [
  { id: 'whatsapp-claims-automation', name: 'WhatsApp Claims Automation', framework: 'Business / Technology Change', phase: 'Test', health: 'At Risk', owner: 'Thabo Mokoena', nextGate: 'UAT Sign-off', dueDate: '28 Aug 2026', progress: 74, blockers: 3, dependencies: 4 },
  { id: 'claims-intake-modernisation', name: 'Claims Intake Modernisation', framework: 'Digital Transformation', phase: 'Build', health: 'On Track', owner: 'Naledi Maseko', nextGate: 'Build Review', dueDate: '04 Sep 2026', progress: 62, blockers: 0, dependencies: 2 },
  { id: 'customer-policy-validation', name: 'Customer Policy Validation', framework: 'Automation Implementation', phase: 'Design', health: 'Watch', owner: 'Zanele Khumalo', nextGate: 'Design Authority', dueDate: '12 Sep 2026', progress: 46, blockers: 1, dependencies: 3 },
  { id: 'digital-onboarding-rollout', name: 'Digital Onboarding Rollout', framework: 'Client Onboarding', phase: 'Ready', health: 'On Track', owner: 'Amara Dlamini', nextGate: 'Go-live Readiness', dueDate: '18 Sep 2026', progress: 86, blockers: 0, dependencies: 2 },
  { id: 'vendor-integration-upgrade', name: 'Vendor Integration Upgrade', framework: 'Technology Change', phase: 'Build', health: 'Critical', owner: 'Lethabo Nkosi', nextGate: 'Integration Review', dueDate: '22 Sep 2026', progress: 51, blockers: 4, dependencies: 6 },
  { id: 'policy-document-hub', name: 'Policy & Document Hub', framework: 'Regulatory Change', phase: 'Discover', health: 'Healthy', owner: 'Mia Daniels', nextGate: 'Discovery Exit', dueDate: '09 Oct 2026', progress: 28, blockers: 0, dependencies: 1 },
]

export const deliveryMetrics = [
  ['Active Projects', '36', '+4 this quarter'],
  ['Projects At Risk', '7', '2 critical'],
  ['Gates Due', '12', 'Next 30 days'],
  ['Outstanding Approvals', '18', '5 overdue'],
  ['Open Blockers', '23', 'Across 11 projects'],
  ['Requirements At Risk', '14', '6 need decisions'],
  ['Upcoming Go-Lives', '5', 'Next 60 days'],
  ['Portfolio Health', '82%', '+3% this month'],
] as const

export type FrameworkRecord = {
  id: string
  name: string
  type: string
  owner: string
  projects: number
  version: string
  review: string
  updated: string
  health: DeliveryHealth
}

export const frameworks: FrameworkRecord[] = [
  { id: 'business-technology-change', name: 'Business / Technology Change', type: 'Enterprise', owner: 'Delivery Office', projects: 12, version: 'v3.2', review: 'Current', updated: '18 Aug 2026', health: 'Healthy' },
  { id: 'automation-implementation', name: 'Automation Implementation', type: 'Technology', owner: 'Digital Delivery', projects: 8, version: 'v2.4', review: 'Due in 14 days', updated: '11 Aug 2026', health: 'Watch' },
  { id: 'client-onboarding', name: 'Client Onboarding', type: 'Operations', owner: 'Client Success', projects: 6, version: 'v4.1', review: 'Current', updated: '04 Aug 2026', health: 'On Track' },
  { id: 'regulatory-change', name: 'Regulatory Change', type: 'Compliance', owner: 'Risk & Compliance', projects: 4, version: 'v2.8', review: 'Review required', updated: '22 Jul 2026', health: 'At Risk' },
  { id: 'digital-transformation', name: 'Digital Transformation', type: 'Enterprise', owner: 'Transformation Office', projects: 9, version: 'v5.0', review: 'Current', updated: '19 Aug 2026', health: 'Healthy' },
  { id: 'product-launch', name: 'Product Launch', type: 'Commercial', owner: 'Growth Office', projects: 3, version: 'v1.9', review: 'Draft update', updated: '29 Jul 2026', health: 'Watch' },
]

export type VendorRecord = {
  id: string
  name: string
  type: string
  projects: number
  owner: string
  exposure: string
  sla: number
  dependencies: number
  contractEnd: string
  compliance: string
  health: DeliveryHealth
}

export const vendors: VendorRecord[] = [
  { id: 'twilio-whatsapp-api', name: 'Twilio (WhatsApp API)', type: 'Technology', projects: 4, owner: 'Lethabo Nkosi', exposure: 'Critical', sla: 92, dependencies: 7, contractEnd: '31 Dec 2026', compliance: 'Current', health: 'At Risk' },
  { id: 'tial-integration', name: 'TIAL Integration Services', type: 'Integration', projects: 3, owner: 'Naledi Maseko', exposure: 'High', sla: 84, dependencies: 5, contractEnd: '30 Nov 2026', compliance: 'Review due', health: 'Watch' },
  { id: 'azure-cloud', name: 'Microsoft Azure', type: 'Infrastructure', projects: 11, owner: 'Thabo Mokoena', exposure: 'High', sla: 99, dependencies: 3, contractEnd: '31 Mar 2027', compliance: 'Current', health: 'Healthy' },
  { id: 'transunion-data', name: 'TransUnion Data Services', type: 'Data', projects: 2, owner: 'Zanele Khumalo', exposure: 'Medium', sla: 96, dependencies: 2, contractEnd: '15 Jan 2027', compliance: 'Current', health: 'On Track' },
  { id: 'dimension-data', name: 'Dimension Data', type: 'Operations', projects: 5, owner: 'Amara Dlamini', exposure: 'Medium', sla: 89, dependencies: 4, contractEnd: '28 Feb 2027', compliance: 'Gap open', health: 'At Risk' },
]

export const approvals = [
  { id: 'uat-signoff', approval: 'UAT Sign-off', type: 'Framework Gate', related: 'WhatsApp Claims Automation', requestedBy: 'Thabo Mokoena', approver: 'Neo Morake', priority: 'Critical', due: 'Today', status: 'Pending' },
  { id: 'vendor-msa', approval: 'Twilio MSA Renewal', type: 'Vendor', related: 'Twilio (WhatsApp API)', requestedBy: 'Lethabo Nkosi', approver: 'Zanele Khumalo', priority: 'High', due: '26 Aug 2026', status: 'Pending' },
  { id: 'design-authority', approval: 'Design Authority Review', type: 'Deliverable', related: 'Customer Policy Validation', requestedBy: 'Naledi Maseko', approver: 'Amara Dlamini', priority: 'Medium', due: '28 Aug 2026', status: 'In Review' },
  { id: 'business-case', approval: 'Updated Business Case', type: 'Project', related: 'Vendor Integration Upgrade', requestedBy: 'Mia Daniels', approver: 'Neo Morake', priority: 'High', due: '22 Aug 2026', status: 'Overdue' },
  { id: 'requirement-set', approval: 'Requirement Baseline v2', type: 'Requirement', related: 'Claims Intake Modernisation', requestedBy: 'Thabo Mokoena', approver: 'Naledi Maseko', priority: 'Medium', due: '30 Aug 2026', status: 'Approved' },
] as const

export const onboardings = [
  { id: 'lumen-financial', client: 'Lumen Financial Services', owner: 'Amara Dlamini', stage: 'Information & Documentation', progress: 62, tasks: 8, documents: 3, goLive: '18 Sep 2026', health: 'On Track' },
  { id: 'meridian-health', client: 'Meridian Health Group', owner: 'Neo Morake', stage: 'Review & Approval', progress: 84, tasks: 3, documents: 1, goLive: '04 Sep 2026', health: 'Watch' },
  { id: 'northstar-retail', client: 'Northstar Retail', owner: 'Lethabo Nkosi', stage: 'Company Setup', progress: 31, tasks: 12, documents: 6, goLive: '09 Oct 2026', health: 'At Risk' },
  { id: 'aurelia-logistics', client: 'Aurelia Logistics', owner: 'Mia Daniels', stage: 'Agreements', progress: 73, tasks: 5, documents: 2, goLive: '25 Sep 2026', health: 'On Track' },
] as const

export const onboardingStages = ['Welcome', 'Company Setup', 'Information & Documentation', 'Agreements', 'Review & Approval', 'Go Live / Handover'] as const
