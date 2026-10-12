import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import type { ResolvedTerms } from '../resolve-terms'
import { currentVersion, saToday, type VersionStatus } from '../selection'
import { loadTermsPreview, type TemplateInfo } from './load-preview'

export type VersionDetail = {
  id: string
  version: number
  status: VersionStatus
  effectiveFrom: string | null
  body: string
  inclusions: string
  changeNote: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  approvedBy: string | null
  approvedAt: string | null
  archivedAt: string | null
}

export type TermsTemplateDetail = {
  template: TemplateInfo
  versions: VersionDetail[]
  current: VersionDetail | null
  draft: VersionDetail | null
  selected: VersionDetail | null
  preview: ResolvedTerms | null
  /** user id -> team member name, for the author and approver columns. */
  names: Record<string, string>
}

/** One template with its versions (a member never receives a draft: the database hides it), the version to preview and its rendered terms. */
export async function getTermsTemplate(templateId: string, requestedVersionId?: string): Promise<TermsTemplateDetail | null> {
  const { organization, db } = await documentContext()
  const found = await db.from('terms_templates').select('id,target_kind,target_key,applies_to,title').eq('id', templateId).eq('organization_id', organization.id).maybeSingle()
  if (found.error) throw found.error
  if (!found.data) return null
  const template: TemplateInfo = { id: found.data.id, targetKind: found.data.target_kind, targetKey: found.data.target_key, appliesTo: found.data.applies_to, title: found.data.title }

  const rows = await db.from('terms_template_versions').select('*').eq('template_id', templateId).eq('organization_id', organization.id).order('version', { ascending: false })
  if (rows.error) throw rows.error
  const versions: VersionDetail[] = (rows.data ?? []).map((row: any) => ({
    id: row.id, version: row.version, status: row.status, effectiveFrom: row.effective_from, body: row.body, inclusions: row.inclusions,
    changeNote: row.change_note, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, approvedBy: row.approved_by, approvedAt: row.approved_at, archivedAt: row.archived_at,
  }))

  const current = currentVersion(versions, saToday())
  const draft = versions.find((item) => item.status === 'draft') ?? null
  const selected = versions.find((item) => item.id === requestedVersionId) ?? draft ?? current ?? versions[0] ?? null

  const userIds = [...new Set(versions.flatMap((item) => [item.createdBy, item.approvedBy]).filter((id): id is string => Boolean(id)))]
  const names: Record<string, string> = {}
  if (userIds.length > 0) {
    const members = await db.from('team_members').select('user_id,full_name').eq('organization_id', organization.id).in('user_id', userIds)
    if (members.error) throw members.error
    for (const member of members.data ?? []) names[member.user_id] = member.full_name
  }

  const preview = selected ? await loadTermsPreview(template, selected) : null
  return { template, versions, current, draft, selected, preview, names }
}
