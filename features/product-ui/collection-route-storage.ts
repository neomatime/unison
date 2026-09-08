import type { CollectionField, CollectionRecord } from './components/record-collection-workspace'

export type CollectionRoutePayload = {
  title: string
  singular: string
  description: string
  fields: CollectionField[]
  records: CollectionRecord[]
  returnHref: string
}

export function collectionSlug(pathname: string, title: string) {
  const source = `${pathname}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return source || 'records'
}

export function collectionStorageKey(organizationId: string, slug: string) {
  return `unison:collection:${organizationId}:${slug}`
}

export function collectionRoute(slug: string, recordId?: string, edit = false) {
  const base = `/records/${encodeURIComponent(slug)}`
  if (!recordId) return `${base}/new`
  return `${base}/${encodeURIComponent(recordId)}${edit ? '/edit' : ''}`
}
