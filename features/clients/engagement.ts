// How a client's primary engagement is shown. The stored values stay 'Retainer' and 'Project' (the database check, the
// client API and the lead-to-client conversion all use them); only the words people read changed.
export const ENGAGEMENT_LABELS: Record<string, string> = { Retainer: 'Monthly Retainer', Project: 'Standalone Project' }

export const engagementLabel = (value: string | null | undefined): string | null => (value ? (ENGAGEMENT_LABELS[value] ?? value) : null)
