import { z } from 'zod'

export const integrationInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  provider: z.string().trim().min(2, 'Choose an integration provider.').max(80),
  eventKey: z.string().trim().toLowerCase().min(3, 'Event key must be at least 3 characters.').max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Use lowercase letters, numbers, dots, underscores, or hyphens.'),
})

export const automationInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  description: z.string().trim().max(1000).optional(),
  integrationConnectionId: z.union([z.literal(''), z.string().uuid()]).optional(),
  triggerType: z.enum(['manual', 'schedule', 'integration_event']),
  status: z.enum(['draft', 'active', 'paused']),
  intervalMinutes: z.coerce.number().int().min(5, 'Scheduled rules must wait at least five minutes.').max(525600),
  timezone: z.string().trim().min(1).max(80),
  eventKey: z.string().trim().max(80).optional(),
  notificationTitle: z.string().trim().min(2, 'Notification title is required.').max(160),
  notificationBody: z.string().trim().max(1000).optional(),
  notificationCategory: z.enum(['System', 'Delivery', 'Operations', 'Commercial', 'Finance', 'Support', 'Documents', 'Import']),
}).superRefine((value, context) => {
  if (value.triggerType === 'integration_event' && !value.integrationConnectionId) {
    context.addIssue({ code: 'custom', path: ['integrationConnectionId'], message: 'Choose an integration for this trigger.' })
  }
})
