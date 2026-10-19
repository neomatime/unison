import {
  Building2,
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock,
  Coins,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Headset,
  Info,
  Layers,
  Mail,
  PenLine,
  Phone,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  COMMERCIAL_HEADING,
  DOWNLOAD_PDF,
  PORTAL_HEADING,
  PORTAL_INTRO,
  QUESTIONS_HEADING,
  READY_TO_RESPOND,
  SCOPE_HEADING,
  SLICE_ONE_RESPOND_NOTE,
  TERMS_HEADING,
  TERMS_STRIP,
} from '@/features/quote-portal/copy'
import { PortalHeader } from '@/features/quote-portal/components/portal-header'
import {
  buildPortalQuoteModel,
  type PortalCommercial,
  type PortalContact,
  type PortalFact,
  type PortalLineRow,
  type PortalLink,
} from '@/features/quote-portal/portal-view-model'
import { cn } from '@/lib/utils'
import { isViewableQuote, type PortalQuote } from '@/lib/quote-portal/types'

// The client-facing quote, laid out. Every figure, date and link arrives already worked out by buildPortalQuoteModel:
// this file does no arithmetic and builds no link of its own, and everything it prints is a React text node, so
// whatever a quote contains (angle brackets, line breaks, five thousand characters) is shown as text and nowhere else.
// In this slice there is no way to respond on the page: only the PDF, a note on how to respond, and who to ask.

const MUTED = 'text-[var(--briefing-muted)]'
const WRAP = '[overflow-wrap:anywhere]'

const FACT_ICONS: Record<string, LucideIcon> = {
  'Quote number': FileText,
  Version: Layers,
  Client: Building2,
  'Project / Service': FolderOpen,
  'Issue date': CalendarDays,
  'Valid until': CalendarDays,
  Status: Clock,
  Amount: Coins,
  VAT: Receipt,
}

const STATUS_PILL = {
  awaiting: 'bg-warning-soft',
  accepted: 'bg-success-soft',
  declined: 'bg-danger-soft',
  neutral: 'bg-accent',
} as const

function SectionTitle({ icon: Icon, id, children }: { icon: LucideIcon; id: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center bg-accent text-brand">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div>
        <h2 id={id} className="font-brand text-lg font-medium leading-tight text-foreground">
          {children}
        </h2>
        <div className="mt-1 h-0.5 w-6 bg-brand" />
      </div>
    </div>
  )
}

function FactsStrip({ facts }: { facts: PortalFact[] }) {
  return (
    <dl className="grid grid-cols-2 border-l border-t border-border bg-accent/40 sm:grid-cols-3">
      {facts.map((fact) => {
        const Icon = FACT_ICONS[fact.label]
        // The quote number takes both columns on a phone: in one column a hyphen would let it break as "HMK-Q-2026-" / "00001".
        const isNumber = fact.label === 'Quote number'
        return (
          <div key={fact.label} className={cn('min-w-0 border-b border-r border-border p-4', isNumber && 'col-span-2 sm:col-span-1')}>
            {/* A list may hold only terms and descriptions, so the icon lives inside the term. */}
            <dt className={cn('text-[11px] uppercase tracking-[0.14em]', MUTED)}>
              {Icon ? <Icon aria-hidden="true" className="mb-2 block size-5 text-brand" /> : null}
              {fact.label}
            </dt>
            <dd className="mt-1">
              {fact.tone ? (
                <span className={cn('inline-block px-2.5 py-1 text-sm font-medium', STATUS_PILL[fact.tone])}>{fact.value}</span>
              ) : (
                <span className={cn('font-medium', isNumber ? 'whitespace-nowrap' : WRAP)}>{fact.value}</span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// The commercial summary is a grid of rows, not an HTML table: on a phone the quantity and unit price columns are dropped,
// and a table cannot drop columns while its summary rows still span them. Both grids end in the same amount column, so
// the figures line up whichever rows they are on. The ARIA roles keep the table's meaning for assistive technology: it
// always has four columns. On a phone the quantity and unit price cells are only visually hidden (sr-only, which also
// takes them out of the grid), never display:none, so a screen reader still reads them, a sum row's label spans three
// columns (aria-colspan) and its amount is read under "Amount", not under "Qty".
const LINE_GRID = 'grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-3 sm:grid-cols-[minmax(0,1fr)_4rem_7rem_9rem]'
const SUM_GRID = 'grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-3 sm:grid-cols-[minmax(0,1fr)_9rem]'
const HEAD = cn('text-[11px] font-medium uppercase tracking-[0.14em]', MUTED)

function LineRows({ rows }: { rows: PortalLineRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <div key={index} role="row" className={cn(LINE_GRID, 'border-b border-border px-3 py-3')}>
          <div role="cell" className={WRAP}>
            <p className="font-medium">{row.title}</p>
            {row.zeroRated ? <p className={cn('text-xs', MUTED)}>Zero-rated</p> : null}
            {/* On a narrow screen the quantity and unit price columns are not drawn; they are shown under the title instead (and not read twice). */}
            <p aria-hidden="true" className={cn('text-xs sm:hidden', MUTED)}>
              {row.quantity} x {row.unitPrice}
            </p>
          </div>
          <div role="cell" className="sr-only text-right tabular-nums sm:not-sr-only">
            {row.quantity}
          </div>
          <div role="cell" className="sr-only text-right tabular-nums sm:not-sr-only">
            {row.unitPrice}
          </div>
          <div role="cell" className="text-right tabular-nums">
            {row.amount}
          </div>
        </div>
      ))}
    </>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div role="row">
      <div role="cell" aria-colspan={4} className={cn('bg-accent/40 px-3 py-2', HEAD)}>
        {children}
      </div>
    </div>
  )
}

function SumRow({ label, amount, strong }: { label: ReactNode; amount: string; strong?: boolean }) {
  return (
    <div role="row" className={cn(SUM_GRID, 'border-b border-border px-3 py-3', strong && 'bg-accent font-semibold')}>
      <div role="rowheader" aria-colspan={3} className={cn('text-right', !strong && 'font-normal', WRAP)}>
        {label}
      </div>
      <div role="cell" className={cn('text-right tabular-nums', strong && 'text-base')}>
        {amount}
      </div>
    </div>
  )
}

function CommercialTable({ commercial }: { commercial: PortalCommercial }) {
  const { totals } = commercial
  return (
    <div>
      <div role="table" aria-label={COMMERCIAL_HEADING} className="text-sm">
        <div role="rowgroup">
          <div role="row" className={cn(LINE_GRID, 'bg-accent px-3 py-2', HEAD)}>
            <div role="columnheader">Description</div>
            <div role="columnheader" className="sr-only text-right sm:not-sr-only">
              Qty
            </div>
            <div role="columnheader" className="sr-only text-right sm:not-sr-only">
              Unit price
            </div>
            <div role="columnheader" className="text-right">
              Amount ({commercial.currency})
            </div>
          </div>
        </div>
        {commercial.grouped ? (
          <>
            {commercial.onceOff ? (
              <div role="rowgroup">
                <GroupLabel>Once-off charges</GroupLabel>
                <LineRows rows={commercial.onceOff.rows} />
                <SumRow label="Once-off subtotal" amount={commercial.onceOff.subtotal} />
              </div>
            ) : null}
            {commercial.monthly ? (
              <div role="rowgroup">
                <GroupLabel>Monthly charges</GroupLabel>
                <LineRows rows={commercial.monthly.rows} />
                <SumRow label="Monthly subtotal (per month)" amount={commercial.monthly.subtotal} />
                {commercial.monthly.vat !== null ? <SumRow label={`${totals.vatLabel} on monthly charges`} amount={commercial.monthly.vat} /> : null}
                {commercial.monthly.includingVat !== null ? <SumRow label="Monthly total including VAT (per month)" amount={commercial.monthly.includingVat} /> : null}
              </div>
            ) : null}
          </>
        ) : (
          <div role="rowgroup">
            <LineRows rows={commercial.rows} />
          </div>
        )}
        {/* The quote's own stored figures: the whole quote, not a sum of the groups above. */}
        <div role="rowgroup">
          <SumRow label="Subtotal" amount={totals.subtotal} />
          <SumRow label={totals.vatLabel} amount={totals.vat} />
          <SumRow label={commercial.totalLabel} amount={totals.total} strong />
        </div>
      </div>
      {commercial.recurringNote ? (
        <p className="mt-4 flex items-start gap-3 border border-border bg-accent/60 p-4 text-sm leading-relaxed">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>{commercial.recurringNote}</span>
        </p>
      ) : null}
    </div>
  )
}

function ContactLine({ icon: Icon, item }: { icon: LucideIcon; item: PortalLink }) {
  return (
    <li className={cn('flex items-start gap-2', WRAP)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      {item.href ? (
        <a href={item.href} rel="noopener noreferrer" className="text-brand underline underline-offset-2">
          {item.text}
        </a>
      ) : (
        <span>{item.text}</span>
      )}
    </li>
  )
}

/** True when the quote gives a name or a way to reach someone; otherwise the questions block would be an empty box. */
const hasContact = ({ name, website, email, phone }: PortalContact) => Boolean(name || website || email || phone)

function ContactBlock({ contact }: { contact: PortalContact }) {
  const { name, jobTitle, company, website, email, phone } = contact
  return (
    <div className="mt-4 space-y-3 text-sm">
      <div className={WRAP}>
        {name ? <p className="font-semibold">{name}</p> : null}
        {jobTitle ? <p className="text-foreground/80">{jobTitle}</p> : null}
        {company ? <p className="text-foreground/80">{company}</p> : null}
      </div>
      {website || email || phone ? (
        <ul className="space-y-1.5">
          {website ? <ContactLine icon={Globe} item={website} /> : null}
          {email ? <ContactLine icon={Mail} item={email} /> : null}
          {phone ? <ContactLine icon={Phone} item={phone} /> : null}
        </ul>
      ) : null}
    </div>
  )
}

export function PortalQuoteView({ token, quote }: { token: string; quote: PortalQuote }) {
  // The page only hands over a quote the client can read; anything else has nothing to lay out.
  if (!isViewableQuote(quote)) return null
  const model = buildPortalQuoteModel(quote)
  const { banner, scope, commercial, terms, contact } = model

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 sm:px-6 lg:px-8">
      <PortalHeader />
      <div className="h-28 overflow-hidden sm:h-40 lg:h-56">
        <img src="/brand/banner.png" alt="" width={2056} height={765} decoding="async" className="size-full object-cover object-right-bottom" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="portal-heading">
            <h1 id="portal-heading" className="font-brand text-3xl font-medium leading-tight text-foreground sm:text-4xl">
              {PORTAL_HEADING}
            </h1>
            <div className="mt-3 h-0.5 w-10 bg-brand" />
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/80">{PORTAL_INTRO}</p>
          </section>

          {banner ? (
            <p
              role="status"
              className={cn('flex items-start gap-3 border p-4 text-sm font-medium', banner.tone === 'accepted' ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft')}
            >
              {banner.tone === 'accepted' ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />}
              <span>{banner.text}</span>
            </p>
          ) : null}

          <FactsStrip facts={model.facts} />

          {scope ? (
            <section aria-labelledby="portal-scope" className="border border-border bg-card p-5 sm:p-6">
              <SectionTitle icon={FileText} id="portal-scope">
                {SCOPE_HEADING}
              </SectionTitle>
              {scope.description.length ? (
                <div className={cn('mt-5 space-y-3 text-sm leading-relaxed text-foreground/85', WRAP)}>
                  {scope.description.map((paragraph, index) => (
                    <p key={index} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}
              {scope.inclusions.length ? (
                <ul className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
                  {scope.inclusions.map((item, index) => (
                    <li key={index} className={cn('flex items-start gap-2.5', WRAP)}>
                      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {scope.services.length ? (
                <dl className="mt-5 space-y-4 border-t border-border pt-5 text-sm">
                  {scope.services.map((service, index) => (
                    <div key={index} className={WRAP}>
                      <dt className="font-medium">{service.title}</dt>
                      <dd className="mt-0.5 whitespace-pre-line leading-relaxed text-foreground/85">{service.description}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="portal-commercial" className="border border-border bg-card p-5 sm:p-6">
            <SectionTitle icon={Coins} id="portal-commercial">
              {COMMERCIAL_HEADING}
            </SectionTitle>
            <div className="mt-5">
              <CommercialTable commercial={commercial} />
            </div>
          </section>

          {terms ? (
            <section aria-labelledby="portal-terms" className="border border-border bg-card p-5 sm:p-6">
              <SectionTitle icon={FileText} id="portal-terms">
                {TERMS_HEADING}
              </SectionTitle>
              <p className={cn('mt-5 text-sm leading-relaxed', MUTED)}>{TERMS_STRIP}</p>
              <ol className={cn('mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/90', WRAP)}>
                {terms.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
              {terms.sources.length ? (
                <p className={cn('mt-5 border-t border-border pt-4 text-xs', MUTED, WRAP)}>Template versions: {terms.sources.join(', ')}</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside aria-label={model.respondable ? READY_TO_RESPOND : DOWNLOAD_PDF} className="border border-border bg-card lg:sticky lg:top-6">
          <div className="p-5 sm:p-6">
            {/* Only an open quote is offered a response: an accepted or declined one has been answered, and the panel then says nothing about responding. */}
            {model.respondable ? <SectionTitle icon={PenLine} id="portal-respond">{READY_TO_RESPOND}</SectionTitle> : null}
            <a
              href={`/q/${token}/pdf`}
              className={cn('flex w-full items-center justify-center gap-2 border border-foreground px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent', model.respondable && 'mt-5')}
            >
              <Download aria-hidden="true" className="size-4" />
              {DOWNLOAD_PDF}
            </a>
            {model.respondable ? <p className={cn('mt-4 text-sm leading-relaxed', MUTED)}>{SLICE_ONE_RESPOND_NOTE}</p> : null}
          </div>
          {hasContact(contact) ? (
            <div className="border-t border-border p-5 sm:p-6">
              <SectionTitle icon={Headset} id="portal-questions">
                {QUESTIONS_HEADING}
              </SectionTitle>
              <ContactBlock contact={contact} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
