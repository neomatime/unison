// How a client's primary engagement is shown. The stored values for the original two stay 'Retainer' and 'Project' (the
// database check, the client API and the lead-to-client conversion all use them); only the words people read changed.
// The Vesper values are stored as they read in the list, with Retainer and Project as the short stored words.
export const ENGAGEMENT_LABELS: Record<string, string> = {
  Retainer: 'Monthly Retainer',
  Project: 'Standalone Project',
  Vesper: 'Vesper',
  'Vesper + Retainer': 'Vesper + Monthly Retainer',
  'Vesper + Project': 'Vesper + Standalone Project',
  'Vesper + Retainer + Project': 'Vesper + Monthly Retainer + Standalone Project',
}

export const engagementLabel = (value: string | null | undefined): string | null => (value ? (ENGAGEMENT_LABELS[value] ?? value) : null)
