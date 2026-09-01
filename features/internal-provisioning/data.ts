import { getEntitledModuleIds } from '@/config/unison-tiers'

import type { ProvisioningWizardState } from './types'

export const provisioningSteps = [
  { id: 'organisation', label: 'Organisation' },
  { id: 'tier', label: 'UNISON Tier' },
  { id: 'modules', label: 'Modules' },
  { id: 'delivery', label: 'Delivery Setup' },
  { id: 'access', label: 'Admin & Access' },
  { id: 'review', label: 'Review & Provision' },
] as const

export const frameworkTemplates = [
  { name: 'Business / Technology Change', version: 'v3.2', description: 'Structured enterprise change from initiation through benefits.' },
  { name: 'Automation Implementation', version: 'v2.4', description: 'Automation discovery, delivery, controls and operational readiness.' },
  { name: 'Client Onboarding', version: 'v2.1', description: 'Controlled setup and transition for new client relationships.' },
  { name: 'Regulatory Change', version: 'v1.8', description: 'Evidence-led compliance change with governed approvals.' },
  { name: 'Digital Transformation', version: 'v4.0', description: 'Multi-workstream digital delivery and value realisation.' },
  { name: 'Product Launch', version: 'v2.7', description: 'Cross-functional readiness for new products and services.' },
]

// The three fields that reach the database or the outgoing invitation email --
// organisation name, and the primary administrator's name and email -- start
// empty on purpose. Everything else here is decorative and persists nowhere, so
// it stays pre-filled. validateCurrent() already rejects these three when
// blank, which is what forces the operator to name a real target rather than
// provisioning whatever the demo data happened to say.
//
// selectedTier belongs to the first group too, and must stay the smallest tier.
// The wizard now sends it on every submit, so the fail-safe defaults behind it
// (the organizations.tier column default and the action's zod .default('core'))
// are unreachable from this path -- whatever sits here is what an operator who
// clicks through the Tier stage without choosing provisions. Starting at 'core'
// keeps the property the tier column was added for: a slip withholds access
// instead of granting it.
export const initialProvisioningState: ProvisioningWizardState = {
  id: 'growthpoint-setup',
  organisation: {
    name: '', tradingName: 'Growthpoint', code: 'GROWT-001', industry: 'Real Estate', size: '1,000–4,999', country: 'South Africa', timeZone: 'Africa/Johannesburg', businessUnit: 'Business Transformation', contactName: 'Sarah Johnson', contactEmail: 'sarah.johnson@growthpoint.co.za', contactRole: 'Business Transformation Lead', implementationOwner: 'Neo Morake', goLive: '2026-10-12', logoName: '', notes: '', tags: 'Enterprise, Property',
  },
  selectedTier: 'core',
  activeModules: getEntitledModuleIds('core'),
  delivery: {
    frameworks: ['Business / Technology Change', 'Automation Implementation'], primaryFramework: 'Business / Technology Change', projectVisibility: 'Organisation', healthCalculation: 'Weighted controls', evidenceAtGates: true, gateLocking: true, mandatoryBusinessCase: true, durationUnit: 'Working days', businessUnits: 'Business Transformation, Property Operations', departments: 'Delivery, Operations, Commercial, Finance', teams: 'Business Solutions, Transformation Office', vendorCadence: 'Quarterly', expiryWarning: '90 days', complianceReview: true, clientCodeFormat: 'CL-{0000}', accountOwner: 'Organisation Admin', onboardingTemplate: 'Standard Client Onboarding', onboardingOwner: 'Client Operations Lead', leadOwner: 'Commercial Lead', quoteValidity: '30 days', salesPipeline: 'Enterprise Sales', currency: 'ZAR', invoiceTerms: '30 days', forecastPeriod: 'Monthly',
  },
  access: {
    primaryAdmin: { id: 'admin-1', name: '', email: '', jobTitle: 'Business Transformation Lead', department: 'Business Transformation', team: 'Transformation Office', deliveryRole: 'Business Owner', organisationRole: 'Organisation Administrator', accessRole: 'Organisation Admin' },
    // Empty for the same reason the three fields above it are: these are
    // addresses. The two demo people who used to sit here were fabricated
    // names at a real external domain -- residue of the pre-filled-target
    // defect -- and the success dialog presented them as "ready to receive
    // workspace invitations" when only the administrator was ever invited.
    // Nothing in this slice invites anyone but the primary administrator, so
    // the operator adds initial users themselves or the list stays empty.
    users: [],
    departments: ['Business Transformation', 'Delivery', 'Operations'], teams: ['Transformation Office', 'Business Solutions'], roles: ['Delivery Manager', 'Project Manager', 'Business Analyst', 'Business Owner'], defaultAccess: 'Member', guestAccess: false, restrictedProjects: true, ssoRequired: true, mfaRequired: true,
  },
  currentStep: 'organisation',
  draftStatus: 'Unsaved',
}

export const provisioningRecords = [
  { id: 'growthpoint-setup', organisation: 'Growthpoint Properties', tier: 'UNISON Enterprise', owner: 'Neo Morake', modules: '15', progress: 92, goLive: '12 Oct 2026', status: 'Ready for Provisioning', updated: 'Today, 10:42' },
  { id: 'northstar-setup', organisation: 'Northstar Advisory', tier: 'UNISON Framework', owner: 'Amara Dlamini', modules: '9', progress: 68, goLive: '02 Nov 2026', status: 'Configuration', updated: 'Yesterday' },
  { id: 'meridian-setup', organisation: 'Meridian Group', tier: 'Strategic Enterprise', owner: 'Neo Morake', modules: '15', progress: 100, goLive: '15 Sep 2026', status: 'Live', updated: '22 Aug 2026' },
  { id: 'aurelia-setup', organisation: 'Aurelia Financial', tier: 'UNISON Core', owner: 'Lethabo Nkosi', modules: '7', progress: 36, goLive: '18 Nov 2026', status: 'Draft', updated: '20 Aug 2026' },
  { id: 'kopano-setup', organisation: 'Kopano Logistics', tier: 'UNISON Enterprise', owner: 'Amara Dlamini', modules: '15', progress: 74, goLive: '28 Oct 2026', status: 'Paused', updated: '18 Aug 2026' },
  { id: 'veridian-setup', organisation: 'Veridian Health', tier: 'UNISON Framework', owner: 'Neo Morake', modules: '9', progress: 81, goLive: '20 Oct 2026', status: 'Failed', updated: '17 Aug 2026' },
]

export const organisations = [
  { id: 'growthpoint', name: 'Growthpoint Properties', tier: 'UNISON Enterprise', status: 'Provisioning', modules: '15', admin: 'Sarah Johnson', owner: 'Neo Morake', created: '24 Aug 2026', activity: '10m ago' },
  { id: 'meridian', name: 'Meridian Group', tier: 'Strategic Enterprise', status: 'Active', modules: '15', admin: 'Olivia Grant', owner: 'Amara Dlamini', created: '03 Mar 2026', activity: '1h ago' },
  { id: 'northstar', name: 'Northstar Advisory', tier: 'UNISON Framework', status: 'Configuration', modules: '9', admin: 'Mia Daniels', owner: 'Amara Dlamini', created: '18 Aug 2026', activity: 'Yesterday' },
  { id: 'aurelia', name: 'Aurelia Financial', tier: 'UNISON Core', status: 'Draft', modules: '7', admin: 'Pending', owner: 'Lethabo Nkosi', created: '20 Aug 2026', activity: '4 days ago' },
]

export const tenants = [
  { id: 'tenant-growthpoint', tenant: 'growthpoint.unison', organisation: 'Growthpoint Properties', tier: 'UNISON Enterprise', modules: '15', users: '3', status: 'Provisioning', environment: 'Production', created: '24 Aug 2026', activity: '10m ago' },
  { id: 'tenant-meridian', tenant: 'meridian.unison', organisation: 'Meridian Group', tier: 'Strategic Enterprise', modules: '15', users: '48', status: 'Active', environment: 'Production', created: '03 Mar 2026', activity: '1h ago' },
  { id: 'tenant-northstar', tenant: 'northstar.unison', organisation: 'Northstar Advisory', tier: 'UNISON Framework', modules: '9', users: '12', status: 'Active', environment: 'Production', created: '14 May 2026', activity: 'Yesterday' },
]

export const subscriptions = [
  { id: 'sub-growthpoint', organisation: 'Growthpoint Properties', tier: 'UNISON Enterprise', status: 'Pending', start: '12 Oct 2026', renewal: '12 Oct 2027', cycle: 'Annual', seats: '50' },
  { id: 'sub-meridian', organisation: 'Meridian Group', tier: 'Strategic Enterprise', status: 'Active', start: '03 Mar 2026', renewal: '03 Mar 2027', cycle: 'Annual', seats: '75' },
  { id: 'sub-northstar', organisation: 'Northstar Advisory', tier: 'UNISON Framework', status: 'Active', start: '14 May 2026', renewal: '14 May 2027', cycle: 'Annual', seats: '25' },
  { id: 'sub-aurelia', organisation: 'Aurelia Financial', tier: 'UNISON Core', status: 'Draft', start: '18 Nov 2026', renewal: '18 Nov 2027', cycle: 'Monthly', seats: '15' },
]
