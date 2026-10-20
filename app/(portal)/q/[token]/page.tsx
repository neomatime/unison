import { PortalQuoteView } from '@/features/quote-portal/components/portal-quote-view'
import { PortalStateCard } from '@/features/quote-portal/components/portal-state-card'
import { ViewedBeacon } from '@/features/quote-portal/components/viewed-beacon'
import { getPortalQuote } from '@/lib/quote-portal/portal-client'
import { isPortalToken } from '@/lib/quote-portal/token'
import { isViewableQuote, type PortalQuote } from '@/lib/quote-portal/types'

// Read live on every request, never prerendered or cached: the address is the credential and the answer depends on
// the quote's state right now.
export const dynamic = 'force-dynamic'

/**
 * The client's quote. Opening it only reads: this page never marks the quote as opened. That is the ViewedBeacon's job,
 * from the browser, once the page has loaded, and it is rendered only next to a quote the client can actually read.
 */
export default async function PortalQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Anything that is not shaped like a token is the same "link not valid" card as an unknown one, without a lookup.
  if (!isPortalToken(token)) return <PortalStateCard quote={{ state: 'invalid' }} />

  let quote: PortalQuote
  try {
    quote = await getPortalQuote(token)
  } catch (error) {
    // portal-client builds its errors without the token, so the message is safe to log. The client sees no detail.
    console.error('[quote-portal:page]', error instanceof Error ? error.message : 'unknown error')
    return <PortalStateCard quote={{ state: 'error' }} />
  }

  if (isViewableQuote(quote)) {
    return (
      <>
        <PortalQuoteView token={token} quote={quote} />
        <ViewedBeacon token={token} />
      </>
    )
  }
  return <PortalStateCard quote={quote} />
}
