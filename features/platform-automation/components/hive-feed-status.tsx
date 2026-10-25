import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '@/features/documents/queries/get-document'
import { documentContext } from '@/features/documents/server-context'
import { feedStatusLines, type HiveFeedStatusInput } from '../feed-status'

/** The status function's JSON as the sentences take it, or null when it is not the shape the function returns. */
function toStatus(data: any): HiveFeedStatusInput | null {
  if (typeof data?.gate_enabled !== 'boolean') return null
  const client = data.client
  return {
    gateEnabled: data.gate_enabled,
    hasLiveKey: data.has_live_key === true,
    lastReadAt: typeof data.last_read_at === 'string' ? data.last_read_at : null,
    client: client && typeof client === 'object' ? { included: client.included === true, since: typeof client.since === 'string' ? client.since : null } : null,
  }
}

/**
 * Whether the quote's client would appear in the HIVE client feed, and when HIVE last read the feed (quote portal,
 * slice 3). It asks the status function through the signed-in member's own session, for the session organisation and the
 * client of this quote, and says nothing about what HIVE did with the feed: UNISON cannot see that.
 *
 * It renders nothing at all, not even its heading, for a quote with no client, for an organisation with no live feed key,
 * and when the read returns an error (one log line: the tag and the error code, never any data). The quote page is
 * dynamic, so this is read again on every visit.
 */
export async function HiveFeedStatus({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  const clientId = bundle?.record.client_id
  if (typeof clientId !== 'string' || clientId === '') return null

  const { organization, db } = await documentContext()
  const { data, error } = await db.rpc('get_hive_feed_status', { p_organization_id: organization.id, p_client_id: clientId })
  if (error) {
    const code = typeof error.code === 'string' && error.code !== '' ? error.code : 'unknown'
    console.error('[hive-feed:status]', code)
    return null
  }

  const status = toStatus(data)
  const lines = status ? feedStatusLines(status) : null
  if (!lines) return null

  return (
    <WorkspaceSection title="HIVE client feed">
      <div className="space-y-1 px-5 py-4 text-sm">
        <p className="text-foreground">{lines.headline}</p>
        {lines.detail ? <p className="text-xs text-muted-foreground">{lines.detail}</p> : null}
      </div>
    </WorkspaceSection>
  )
}
