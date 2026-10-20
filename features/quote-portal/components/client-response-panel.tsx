import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '@/features/documents/queries/get-document'
import { isDraftStatus } from '@/features/documents/vocabulary'
import { revokeLinkAction } from '../actions/links'
import { isLinkEmailConfirmed, linkState, type LinkState } from '../link-state'
import { listQuoteLinks, listQuoteResponses, listQuoteSends, type QuoteResponseRow } from '../queries/list-quote-links'
import { responseAttribution, termsVersionLabels } from '../response-attribution'

const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })

/** A time in South African time; a value that is not a time prints as "unknown time" rather than failing the page. */
const when = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'unknown time' : WHEN.format(date)
}

const TONE: Record<LinkState, 'brand' | 'neutral' | 'danger' | 'info' | 'warning'> = {
  Active: 'brand',
  Expired: 'neutral',
  Revoked: 'danger',
  Superseded: 'info',
  'Not sent': 'warning',
}

// Staff-facing wording for a recorded response. (Client-facing copy lives in ../copy.ts, not here.)
const DECISION_LABEL: Record<QuoteResponseRow['decision'], string> = { accepted: 'Accepted', declined: 'Declined' }
const DECISION_TONE: Record<QuoteResponseRow['decision'], 'brand' | 'danger'> = { accepted: 'brand', declined: 'danger' }
const MARKED_BY_STAFF = 'Marked by staff'
const NO_CLIENT_RESPONSE = 'No client response is on record for this status.'

/** One labelled value in a response. The values are the client's own words: they are shown as text, wrapped, never as markup. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  )
}

/** What the client answered: who, when, to which version of the quote and its terms, and why when it was a decline. */
function ResponseBlock({ response }: { response: QuoteResponseRow }) {
  const termsVersions = termsVersionLabels(response.terms_sources)
  return (
    <li className="px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">Response</h3>
        <StatusBadge tone={DECISION_TONE[response.decision]}>{DECISION_LABEL[response.decision]}</StatusBadge>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <Fact label="Signatory">{response.signatory_name}</Fact>
        <Fact label="Position">{response.signatory_position}</Fact>
        <Fact label="Organisation">{response.signatory_organisation}</Fact>
        <Fact label="Verified email">{response.verified_email}</Fact>
        <Fact label="Decided">{when(response.decided_at)}</Fact>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Quote version {response.quote_version}
        {termsVersions.length > 0 ? <> · Terms {termsVersions.join(', ')}</> : null}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">Snapshot hash</p>
      <code className="mt-0.5 block break-all font-mono text-xs text-foreground">{response.snapshot_hash}</code>
      {response.decision === 'declined' ? (
        <div className="mt-3 text-xs">
          <p className="text-muted-foreground">Reason</p>
          <p className="mt-0.5 break-words text-foreground">{response.decline_reason ?? 'No reason given'}</p>
          {response.decline_comments ? (
            <>
              <p className="mt-2 text-muted-foreground">Comments</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{response.decline_comments}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * The secure links made for a sent quote: who each went to, when it was made and expires, whether the email that
 * carried it is on record, when the client opened it, and Revoke while it works. Also the chain of revisions, and what
 * the client answered: the response on record for each link that carries one, and, when the quote's status is Accepted
 * or Declined without a client answer behind it, that staff marked it.
 * Staff never see the address of a link (only its fingerprint is stored), so there is nothing to show or link to.
 *
 * A draft has none of this. A quote with no links and no response says something only while the organisation's portal
 * switch is on: with it off, and nothing ever sent, the panel is not there.
 */
export async function ClientResponsePanel({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  if (!bundle || isDraftStatus('quote', bundle.record.status)) return null
  const [{ links, replacesNumber, replacedBy }, sends, responses] = await Promise.all([listQuoteLinks(quoteId), listQuoteSends(quoteId), listQuoteResponses(quoteId)])
  const switchOn = bundle.settings?.quote_portal_enabled === true
  if (links.length === 0 && responses.length === 0 && !switchOn) return null
  const now = new Date()
  const awaitingResponse = bundle.record.status === 'Sent'
  const attribution = responseAttribution(bundle.record.status, responses)
  const responseByLink = new Map<string, QuoteResponseRow>(responses.map((response) => [response.link_id, response]))
  // The newer quote only replaces this one once this one is Superseded; a Declined or Expired original that was revised is revised, not replaced.
  const replacedByLabel = bundle.record.status === 'Superseded' ? 'Replaced by' : 'Revised as'

  return (
    <WorkspaceSection
      title="Client portal"
      description="Secure links for the client to review this quote online. Opened is best effort: servers and mail scanners that do not run scripts are not counted."
    >
      {replacesNumber || replacedBy.length > 0 ? (
        <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
          {replacesNumber ? <span>Replaces {replacesNumber}</span> : null}
          {replacesNumber && replacedBy.length > 0 ? ' · ' : null}
          {replacedBy.length > 0 ? <span>{replacedByLabel} {replacedBy.join(', ')}</span> : null}
        </p>
      ) : null}
      {attribution === 'staff' ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm">
          <StatusBadge tone="warning">{MARKED_BY_STAFF}</StatusBadge>
          <p className="text-muted-foreground">{NO_CLIENT_RESPONSE}</p>
        </div>
      ) : null}
      {responses.length > 0 ? (
        <ul className="divide-y divide-border border-b border-border">
          {responses.map((response) => (
            <ResponseBlock key={response.id} response={response} />
          ))}
        </ul>
      ) : null}
      {links.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {awaitingResponse ? 'A secure link is added to quote emails while the quote is awaiting a response.' : 'No secure link was sent for this quote.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => {
            const state = linkState(link, now)
            const responded = responseByLink.get(link.id)
            return (
              <li key={link.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">
                    {link.recipient_name ? `${link.recipient_name} (${link.recipient_email})` : link.recipient_email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {when(link.created_at)} · Expires {when(link.expires_at)}
                    {state === 'Not sent' ? null : <> · {isLinkEmailConfirmed(link, links, sends) ? 'Emailed' : 'Not confirmed sent'}</>}
                    {state === 'Revoked' && link.revoked_at ? <> · Revoked {when(link.revoked_at)}</> : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {link.first_viewed_at ? (
                      <>
                        Opened {when(link.first_viewed_at)}
                        {link.last_viewed_at && link.last_viewed_at !== link.first_viewed_at ? <> · last opened {when(link.last_viewed_at)}</> : null}
                      </>
                    ) : (
                      'Not opened yet'
                    )}
                  </p>
                  {responded ? <p className="mt-1 text-xs text-muted-foreground">Responded {when(responded.decided_at)}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone={TONE[state]}>{state}</StatusBadge>
                  {state === 'Active' ? (
                    <ActionButton
                      action={revokeLinkAction.bind(null, link.id)}
                      label="Revoke"
                      ariaLabel={`Revoke link for ${link.recipient_email}`}
                      tone="danger"
                      confirmText="Revoke this link? The client will no longer be able to open it."
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WorkspaceSection>
  )
}
