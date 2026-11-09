import { z } from 'zod'

import {
  ACQUISITION_CHANNELS,
  DEFAULT_FORM_CONFIG,
  INDUSTRIES,
  OBJECTIVES,
  SERVICE_IDS,
  TIMELINES,
  type PublicFormConfig,
  type ServiceId,
} from './catalog'

const serviceId = z.enum(SERVICE_IDS)
const timelineId = z.enum(TIMELINES.map(([id]) => id) as [string, ...string[]])
const industryId = z.enum(INDUSTRIES.map(([id]) => id) as [string, ...string[]])
const channelId = z.enum(ACQUISITION_CHANNELS.map(([id]) => id) as [string, ...string[]])
const sourceToken = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/)
const cleanText = (maximum: number) => z.string().trim().max(maximum)

export const engagementSubmissionSchema = z.strictObject({
  submissionKey: z.uuid(),
  formVersionId: z.uuid(),
  selectedServices: z.array(serviceId).min(1).max(5),
  primaryService: serviceId,
  primaryObjective: z.string().trim().min(1).max(80),
  expectedTimeline: timelineId,
  additionalInformation: cleanText(500).default(''),
  organisationName: z.string().trim().min(2).max(180),
  industry: industryId,
  fullName: z.string().trim().min(2).max(160),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  jobTitle: cleanText(120).default(''),
  phone: cleanText(40).default(''),
  country: cleanText(100).default(''),
  contactPreference: z.enum(['email', 'telephone']).default('email'),
  privacyAcknowledged: z.literal(true),
  marketingConsent: z.boolean().default(false),
  sourceToken: sourceToken.nullable().default(null),
  channel: channelId.default('corporate-website'),
  utm: z.strictObject({
    source: cleanText(120).default(''),
    medium: cleanText(120).default(''),
    campaign: cleanText(160).default(''),
    term: cleanText(160).default(''),
    content: cleanText(160).default(''),
  }),
  startedAt: z.iso.datetime({ offset: true }),
  website: cleanText(200).default(''),
}).superRefine((value, ctx) => {
  const uniqueServices = new Set(value.selectedServices)
  if (uniqueServices.size !== value.selectedServices.length) {
    ctx.addIssue({ code: 'custom', path: ['selectedServices'], message: 'Choose each area only once.' })
  }
  if (uniqueServices.has('not-sure') && uniqueServices.size > 1) {
    ctx.addIssue({ code: 'custom', path: ['selectedServices'], message: "I'm Not Sure Yet cannot be combined with another area." })
  }
  if (!uniqueServices.has(value.primaryService)) {
    ctx.addIssue({ code: 'custom', path: ['primaryService'], message: 'Choose a primary area from your interests.' })
  }
  const objectiveIds = new Set(OBJECTIVES[value.primaryService as ServiceId].map(([id]) => id))
  if (!objectiveIds.has(value.primaryObjective as never)) {
    ctx.addIssue({ code: 'custom', path: ['primaryObjective'], message: 'Choose an objective for your primary area.' })
  }
  if (value.contactPreference === 'telephone' && !value.phone) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Add a contact number if you prefer a telephone call.' })
  }
})

export type EngagementSubmission = z.infer<typeof engagementSubmissionSchema>

export const formConfigSchema: z.ZodType<PublicFormConfig> = z.strictObject({
  headline: z.string().trim().min(5).max(120),
  supportingText: z.string().trim().min(10).max(300),
  privacyNoticeUrl: z.url().refine((value) => value.startsWith('https://'), 'Use an HTTPS privacy notice URL.'),
  privacyNoticeVersion: z.string().trim().min(1).max(40),
  enabledServices: z.array(serviceId).min(1).refine((items) => new Set(items).size === items.length),
})

export function parseFormConfig(value: unknown): PublicFormConfig {
  const parsed = formConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_FORM_CONFIG
}

export const acquisitionLinkInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  channel: channelId,
  campaignName: cleanText(160).nullable(),
  eventName: cleanText(160).nullable(),
  assignedToId: z.uuid().nullable(),
  referringEmployeeId: z.uuid().nullable(),
  formVersionId: z.uuid().nullable(),
})

