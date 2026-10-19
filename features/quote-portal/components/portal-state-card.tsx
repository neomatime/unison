import { Clock, FileText, Link2Off, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { PortalHeader } from '@/features/quote-portal/components/portal-header'
import { QUESTIONS_HEADING } from '@/features/quote-portal/copy'
import { buildStateCardModel, type StateCardKind } from '@/features/quote-portal/portal-view-model'
import type { PortalQuoteInvalid, PortalQuoteShort } from '@/lib/quote-portal/types'

const ICONS: Record<StateCardKind, LucideIcon> = { expired: Clock, superseded: FileText, invalid: Link2Off, error: TriangleAlert }

/**
 * The page for a link whose quote cannot be read: expired, replaced by a newer version, not valid, or a temporary
 * fault. Calm: one heading, one sentence, what little the short answer carries of the quote, and the owner to contact
 * where there is one. A link that is not valid shows nothing about any quote. No controls of its own: the error page
 * passes its retry button as children.
 */
export function PortalStateCard({ quote, children }: { quote: PortalQuoteShort | PortalQuoteInvalid | { state: 'error' }; children?: ReactNode }) {
  const card = buildStateCardModel(quote)
  const Icon = ICONS[card.kind]
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 sm:px-6 lg:px-8">
      <PortalHeader />
      <section aria-labelledby="portal-state-heading" className="mx-auto mt-6 w-full max-w-xl border border-border border-t-2 border-t-brand bg-card p-6 sm:mt-14 sm:p-10">
        <span className="flex size-12 items-center justify-center bg-accent text-brand">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h1 id="portal-state-heading" className="mt-5 font-brand text-2xl font-medium leading-tight text-foreground sm:text-3xl">
          {card.heading}
        </h1>
        <div className="mt-3 h-0.5 w-10 bg-brand" />
        <p className="mt-4 text-base leading-relaxed text-foreground/80">{card.sentence}</p>

        {card.facts.length ? (
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
            {card.facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-[0.14em] text-[var(--briefing-muted)]">{fact.label}</dt>
                <dd className="mt-1 font-medium [overflow-wrap:anywhere]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {card.contact ? (
          <div className="mt-6 border-t border-border pt-5 text-sm">
            <p className="mb-2 text-[var(--briefing-muted)]">{QUESTIONS_HEADING}</p>
            {card.contact.name ? <p className="font-semibold [overflow-wrap:anywhere]">{card.contact.name}</p> : null}
            {card.contact.jobTitle ? <p className="text-foreground/80 [overflow-wrap:anywhere]">{card.contact.jobTitle}</p> : null}
            {card.contact.email ? (
              <p className="mt-1 [overflow-wrap:anywhere]">
                {card.contact.email.href ? (
                  <a href={card.contact.email.href} className="text-brand underline underline-offset-2">
                    {card.contact.email.text}
                  </a>
                ) : (
                  card.contact.email.text
                )}
              </p>
            ) : null}
          </div>
        ) : null}
        {children}
      </section>
    </div>
  )
}
