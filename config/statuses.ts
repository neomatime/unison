export const projectStatuses = ['On Track', 'At Risk', 'Delayed'] as const
export type ProjectStatus = (typeof projectStatuses)[number]

export const statusLabels = {
  onTrack: 'On Track',
  atRisk: 'At Risk',
  delayed: 'Delayed',
  successful: 'Successful',
  failed: 'Failed',
  pending: 'Pending',
} as const
