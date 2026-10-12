// How the template list is grouped and what each row's status badge says. Pure.

export type TemplateSummary = {
  id: string
  targetKind: 'company' | 'retainer' | 'project' | 'support'
  targetKey: string | null
  appliesTo: 'quote' | 'invoice' | 'both'
  title: string
  current: { version: number; effectiveFrom: string } | null
  upcoming: { version: number; effectiveFrom: string } | null
  /** Only owners and admins can see drafts, so this is false for a member whatever exists. */
  hasDraft: boolean
}

const CARE = ['ai_automation_care', 'application_interface_care', 'website_care', 'communication_asset_care']
const MANAGED = ['operations_improvement', 'digital_experience_management', 'digital_presence_management']
const CONTENT = ['podcast_content', 'integrated_podcast_social', 'social_media_content']

function groupLabel(row: TemplateSummary): string {
  if (row.targetKind === 'company') return 'Company'
  if (row.targetKind === 'retainer') return 'Strategic Partnerships'
  if (row.targetKind === 'project') return 'Projects'
  if (row.targetKey && CARE.includes(row.targetKey)) return 'Project Care'
  if (row.targetKey && MANAGED.includes(row.targetKey)) return 'Managed Services'
  if (row.targetKey && CONTENT.includes(row.targetKey)) return 'Recurring Content'
  return 'Other services'
}

const ORDER = ['Company', 'Strategic Partnerships', 'Projects', 'Project Care', 'Managed Services', 'Recurring Content', 'Other services']

export function groupTemplates(rows: TemplateSummary[]): Array<{ label: string; rows: TemplateSummary[] }> {
  return ORDER
    .map((label) => ({ label, rows: rows.filter((row) => groupLabel(row) === label).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((group) => group.rows.length > 0)
}

export type TemplateStatus = {
  kind: 'current' | 'upcoming' | 'none'
  version?: number
  effectiveFrom?: string
  /** Set only when a version is in force AND a later approved version is waiting for its date. */
  upcoming?: { version: number; effectiveFrom: string }
}

export function templateStatus(row: TemplateSummary): TemplateStatus {
  if (row.current) {
    const status: TemplateStatus = { kind: 'current', version: row.current.version, effectiveFrom: row.current.effectiveFrom }
    if (row.upcoming) status.upcoming = { version: row.upcoming.version, effectiveFrom: row.upcoming.effectiveFrom }
    return status
  }
  if (row.upcoming) return { kind: 'upcoming', version: row.upcoming.version, effectiveFrom: row.upcoming.effectiveFrom }
  return { kind: 'none' }
}
