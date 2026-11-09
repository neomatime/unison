import type { PublicFormConfig } from './catalog'

export type PublicEngagementContext = {
  formVersionId: string
  formVersion: string
  config: PublicFormConfig
  source: null | {
    token: string
    channel: string
  }
}

export type AcquisitionLinkRow = {
  id: string
  token: string
  name: string
  channel: string
  campaignName: string | null
  eventName: string | null
  assignedToId: string | null
  assignedToName: string | null
  referringEmployeeId: string | null
  referringEmployeeName: string | null
  formVersionId: string | null
  active: boolean
  visits: number
  submissions: number
  createdAt: string
}

export type EngagementDetails = {
  id: string
  selectedServices: string[]
  primaryService: string
  primaryObjective: string
  expectedTimeline: string
  additionalInformation: string | null
  organisationName: string
  industry: string
  country: string | null
  fullName: string
  email: string
  phone: string | null
  jobTitle: string | null
  preferredContact: string
  channel: string
  sourceName: string | null
  campaignName: string | null
  eventName: string | null
  marketingConsent: boolean
  privacyNoticeVersion: string
  submittedAt: string
  formVersion: string
  utm: Record<string, string>
}
