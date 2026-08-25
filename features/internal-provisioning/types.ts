import type { UnisonModuleId, UnisonTierId } from '@/config/unison-tiers'

export type ProvisioningStepId = 'organisation' | 'tier' | 'modules' | 'delivery' | 'access' | 'review'

export type OrganisationConfiguration = {
  name: string
  tradingName: string
  code: string
  industry: string
  size: string
  country: string
  timeZone: string
  businessUnit: string
  contactName: string
  contactEmail: string
  contactRole: string
  implementationOwner: string
  goLive: string
  logoName: string
  notes: string
  tags: string
}

export type DeliveryConfiguration = {
  frameworks: string[]
  primaryFramework: string
  projectVisibility: string
  healthCalculation: string
  evidenceAtGates: boolean
  gateLocking: boolean
  mandatoryBusinessCase: boolean
  durationUnit: string
  businessUnits: string
  departments: string
  teams: string
  vendorCadence: string
  expiryWarning: string
  complianceReview: boolean
  clientCodeFormat: string
  accountOwner: string
  onboardingTemplate: string
  onboardingOwner: string
  leadOwner: string
  quoteValidity: string
  salesPipeline: string
  currency: string
  invoiceTerms: string
  forecastPeriod: string
}

export type ProvisioningUser = {
  id: string
  name: string
  email: string
  jobTitle: string
  department: string
  team: string
  deliveryRole: string
  accessRole: string
}

export type AccessConfiguration = {
  primaryAdmin: ProvisioningUser & { organisationRole: string }
  users: ProvisioningUser[]
  departments: string[]
  teams: string[]
  roles: string[]
  defaultAccess: string
  guestAccess: boolean
  restrictedProjects: boolean
  ssoRequired: boolean
  mfaRequired: boolean
}

export type ProvisioningWizardState = {
  id: string
  organisation: OrganisationConfiguration
  selectedTier: UnisonTierId
  activeModules: UnisonModuleId[]
  delivery: DeliveryConfiguration
  access: AccessConfiguration
  currentStep: ProvisioningStepId
  draftStatus: 'Unsaved' | 'Draft Saved' | 'Ready'
}
