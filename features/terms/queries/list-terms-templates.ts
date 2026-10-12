import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import type { TemplateSummary } from '../grouping'
import { currentVersion, saToday, upcomingVersion, type SelectableVersion } from '../selection'

type VersionRow = SelectableVersion & { templateId: string }

/** Every template of the organisation with the version in force, the one coming next, and whether a draft exists. */
export async function listTermsTemplates(): Promise<TemplateSummary[]> {
  const { organization, db } = await documentContext()
  const [templates, versions] = await Promise.all([
    db.from('terms_templates').select('id,target_kind,target_key,applies_to,title').eq('organization_id', organization.id).order('title'),
    db.from('terms_template_versions').select('template_id,version,status,effective_from').eq('organization_id', organization.id),
  ])
  if (templates.error) throw templates.error
  if (versions.error) throw versions.error

  const today = saToday()
  const byTemplate = new Map<string, VersionRow[]>()
  for (const row of versions.data ?? []) {
    const list = byTemplate.get(row.template_id) ?? []
    list.push({ templateId: row.template_id, version: row.version, status: row.status, effectiveFrom: row.effective_from })
    byTemplate.set(row.template_id, list)
  }

  return (templates.data ?? []).map((row: any): TemplateSummary => {
    const own = byTemplate.get(row.id) ?? []
    const current = currentVersion(own, today)
    const upcoming = upcomingVersion(own, today)
    return {
      id: row.id,
      targetKind: row.target_kind,
      targetKey: row.target_key,
      appliesTo: row.applies_to,
      title: row.title,
      current: current ? { version: current.version, effectiveFrom: current.effectiveFrom as string } : null,
      upcoming: upcoming ? { version: upcoming.version, effectiveFrom: upcoming.effectiveFrom as string } : null,
      hasDraft: own.some((item) => item.status === 'draft'),
    }
  })
}
