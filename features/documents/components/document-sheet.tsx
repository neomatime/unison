import { Fragment } from 'react'

import type { DocumentView } from '../document-view'

// The sheet lives inside the app shell (a fixed-height, clipped, animated column), so printing it cannot rely on
// absolute positioning. Instead, every ancestor of the sheet (found structurally with :has, not by class name) is
// made an ordinary static block with no height limit, clipping, transform or animation, everything beside those
// ancestors is removed from the page, and the sheet then flows from the top left of the first page and onto
// further pages when it is long. The route view rule is listed by name as well, as the one known animated ancestor.
// The remaining rules stop the shell's table, heading and button styling from leaking onto the sheet, on screen too.
const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  .document-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .document-print :is(h1, h2, h3) { font-family: inherit; color: inherit; }
  .document-print thead { font-family: inherit; }
  .document-print tbody tr, .document-print tbody tr:hover { background-color: transparent; box-shadow: none; transition: none; }
  .document-print tbody tr:nth-child(odd), .document-print tbody tr:nth-child(odd):hover { background-color: #f2f5f9; }
  @media print {
    *:has(.document-print), .unison-route-view {
      position: static !important; display: block !important; float: none !important;
      width: auto !important; min-width: 0 !important; height: auto !important; min-height: 0 !important; max-height: none !important;
      margin: 0 !important; padding: 0 !important; border: 0 !important;
      overflow: visible !important; contain: none !important; filter: none !important; backdrop-filter: none !important;
      transform: none !important; animation: none !important; transition: none !important;
    }
    *:has(.document-print) > *:not(:has(.document-print)):not(.document-print) { display: none !important; }
    .document-print { position: relative !important; width: 210mm !important; max-width: none !important; min-height: 296mm; margin: 0 !important; overflow: visible !important; box-shadow: none !important; }
  }
`

const INK = 'text-[#0c2a4d]'
const MUTED = 'text-[#4a6585]'
const RULE = 'h-[0.6mm] w-[14mm] bg-[#0c2a4d]'

export function DocumentSheet({ view }: { view: DocumentView }) {
  const label = view.number ? `${view.kind === 'quote' ? 'Quote' : 'Invoice'} ${view.number}` : `Draft ${view.kind}`
  const hasProject = Boolean(view.project)
  const hasFrom = Boolean(view.from.name) || view.from.lines.length > 0 || Boolean(view.from.vatNumber)
  return (
    <>
      <style>{PRINT_CSS}</style>
      <article
        aria-label={label}
        className={`document-print relative mx-auto min-h-[296mm] w-full max-w-[210mm] overflow-hidden bg-white text-[10pt] leading-snug shadow-sm ${INK}`}
      >
        {view.draft ? (
          <p aria-hidden="true" className="pointer-events-none absolute right-[12mm] top-[30mm] z-10 -rotate-6 border-2 border-[#c0392b]/60 bg-white/70 px-4 py-1 text-[16pt] font-bold tracking-[0.3em] text-[#c0392b]/60">
            DRAFT
          </p>
        ) : null}

        <header className="relative h-[34mm] bg-[#bcd9f5]">
          {view.headerImage ? <img src={view.headerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right-bottom" /> : null}
          <div className="relative flex h-full flex-col justify-center px-[12mm]">
            {view.logo ? (
              <img src={view.logo} alt={view.from.name ?? ''} className="h-[18mm] w-auto self-start object-contain object-left" />
            ) : view.from.name ? (
              <p className="break-words text-[20pt] font-semibold tracking-[0.2em]">{view.from.name}</p>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-[1fr_auto] gap-[8mm] px-[12mm] pt-[6mm]">
          <div className="min-w-0">
            <h2 className="text-[34pt] font-light tracking-[0.22em]">{view.title}</h2>
            {view.tagline ? <p className={`mt-2 text-[8pt] uppercase tracking-[0.35em] ${MUTED}`}>{view.tagline}</p> : null}
            <div className={`mt-5 ${RULE}`} />
          </div>
          <dl className="grid max-w-[70mm] grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[8mm] gap-y-[2.2mm] border-l border-[#c9d4e3] pl-[8mm] text-[8pt]">
            {view.details.map((row) => (
              <Fragment key={row.label}>
                <dt className={`uppercase tracking-[0.2em] ${MUTED}`}>{row.label}</dt>
                <dd className="[overflow-wrap:anywhere] font-medium uppercase tracking-[0.1em]">{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>

        <section className="mt-[7mm] grid grid-cols-3 gap-[6mm] px-[12mm]">
          <div className={`min-w-0 ${hasProject || hasFrom ? 'border-r border-[#d8e0ec] pr-[5mm]' : ''}`}>
            <p className={`text-[7.5pt] uppercase tracking-[0.25em] ${MUTED}`}>{view.billToHeading}</p>
            {view.billTo.map((line, index) => (
              <p key={index} className={index === 0 ? 'mt-2 break-words text-[12pt] font-semibold' : 'break-words text-[9.5pt]'}>{line}</p>
            ))}
          </div>
          <div className={`min-w-0 ${hasProject && hasFrom ? 'border-r border-[#d8e0ec] pr-[5mm]' : ''}`}>
            {view.project ? (
              <>
                <p className={`text-[7.5pt] uppercase tracking-[0.25em] ${MUTED}`}>Project</p>
                {view.project.title ? <p className="mt-2 break-words text-[12pt] font-semibold">{view.project.title}</p> : null}
                {view.project.lines.map((line, index) => <p key={index} className="whitespace-pre-line break-words text-[9.5pt]">{line}</p>)}
              </>
            ) : null}
          </div>
          <div className="min-w-0">
            {hasFrom ? (
              <>
                <p className={`text-[7.5pt] uppercase tracking-[0.25em] ${MUTED}`}>{view.fromHeading}</p>
                {view.from.name ? <p className="mt-2 break-words text-[12pt] font-semibold">{view.from.name}</p> : null}
                {view.from.lines.map((line, index) => <p key={index} className="break-words text-[9.5pt]">{line}</p>)}
                {view.from.vatNumber ? <p className="mt-2 break-words text-[9.5pt]">VAT No: {view.from.vatNumber}</p> : null}
              </>
            ) : null}
          </div>
        </section>

        <section className="mt-[6mm] px-[12mm]">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col className="w-[18mm]" />
              <col className="w-[34mm]" />
              <col className="w-[34mm]" />
            </colgroup>
            <thead className="bg-[#0c2a4d] text-white">
              <tr>
                <th scope="col" className="px-[4mm] py-[2mm] text-left text-[7.5pt] font-medium uppercase tracking-[0.25em]">Description</th>
                <th scope="col" className="px-[2mm] py-[2mm] text-center text-[7.5pt] font-medium uppercase tracking-[0.25em]">Qty</th>
                <th scope="col" className="px-[4mm] py-[2mm] text-right text-[7.5pt] font-medium uppercase tracking-[0.25em]">Unit price ({view.currency})</th>
                <th scope="col" className="px-[4mm] py-[2mm] text-right text-[7.5pt] font-medium uppercase tracking-[0.25em]">Amount ({view.currency})</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((line, index) => (
                <tr key={index} className="break-inside-avoid">
                  <td className="px-[4mm] py-[2mm] align-top">
                    <p className="break-words font-semibold">{line.title}</p>
                    {line.description ? <p className={`mt-0.5 whitespace-pre-line break-words text-[9pt] ${MUTED}`}>{line.description}</p> : null}
                  </td>
                  <td className="px-[2mm] py-[2mm] text-center align-top">{line.quantity}</td>
                  <td className="px-[4mm] py-[2mm] text-right align-top">{line.unitPrice}</td>
                  <td className="px-[4mm] py-[2mm] text-right align-top">{line.amount}</td>
                </tr>
              ))}
              {view.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`px-[4mm] py-[6mm] text-center ${MUTED}`}>No lines yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mt-[5mm] grid grid-cols-[1fr_78mm] gap-[8mm] px-[12mm]">
          <div className="min-w-0">
            {view.terms.length ? (
              <>
                <div className={RULE} />
                <h3 className="mt-3 text-[8pt] uppercase tracking-[0.25em]">{view.termsHeading}</h3>
                {view.termsNumbered ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-[8.5pt]">
                    {view.terms.map((term, index) => <li key={index} className="break-words">{term}</li>)}
                  </ol>
                ) : (
                  <div className="mt-2 space-y-1 text-[9pt]">
                    {view.terms.map((term, index) => <p key={index} className="break-words">{term}</p>)}
                  </div>
                )}
              </>
            ) : null}
          </div>
          <dl className="grid break-inside-avoid grid-cols-[1fr_auto] text-[9pt]">
            <dt className="bg-[#e8eef6] px-[4mm] py-[2.5mm] uppercase tracking-[0.2em]">Subtotal</dt>
            <dd className="bg-[#e8eef6] px-[4mm] py-[2.5mm] text-right font-semibold">{view.totals.subtotal}</dd>
            <dt className="bg-[#e8eef6] px-[4mm] py-[2.5mm] uppercase tracking-[0.2em]">{view.totals.vatLabel}</dt>
            <dd className="bg-[#e8eef6] px-[4mm] py-[2.5mm] text-right font-semibold">{view.totals.vat}</dd>
            <dt className="bg-[#0c2a4d] px-[4mm] py-[3.5mm] uppercase tracking-[0.2em] text-white">Total ({view.currency})</dt>
            <dd className="bg-[#0c2a4d] px-[4mm] py-[3.5mm] text-right text-[13pt] font-bold text-white">{view.totals.total}</dd>
          </dl>
        </section>

        <section className="mt-[5mm] grid grid-cols-[38%_34%_28%]">
          <div className={view.bank.length ? 'break-inside-avoid bg-[#e3ebf5] px-[12mm] py-[3mm]' : ''}>
            {view.bank.length ? (
              <>
                <h3 className="text-[8pt] uppercase tracking-[0.25em]">Bank details</h3>
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[8.5pt]">
                  {view.bank.map((row) => (
                    <Fragment key={row.label}>
                      <dt className={MUTED}>{row.label}</dt>
                      <dd className="[overflow-wrap:anywhere]">{row.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </>
            ) : null}
          </div>
          <div className="min-w-0 break-inside-avoid px-[6mm] py-[3mm]">
            {view.closing ? (
              <>
                <h3 className="text-[8pt] uppercase tracking-[0.25em]">{view.closing.heading}</h3>
                {view.closing.paragraphs.map((paragraph, index) => <p key={index} className={`mt-2 break-words text-[9pt] ${MUTED}`}>{paragraph}</p>)}
                <div className={`mt-3 ${RULE}`} />
                {view.from.name ? <p className="mt-3 break-words text-[10pt] tracking-[0.12em]">{view.from.name}</p> : null}
              </>
            ) : null}
          </div>
          <div className="relative min-h-[28mm]">
            {view.headerImage ? <img src={view.headerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right" /> : null}
          </div>
        </section>

        <footer className="mx-[12mm] mt-[4mm] flex flex-wrap items-center justify-between gap-3 border-t border-[#c9d4e3] py-[3mm] text-[8.5pt]">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {view.footer.email ? <span className="break-all">{view.footer.email}</span> : null}
            {view.footer.phone ? <span>{view.footer.phone}</span> : null}
            {view.footer.website ? <span className="break-all">{view.footer.website}</span> : null}
          </div>
          {view.tagline ? <span className={`uppercase tracking-[0.3em] ${MUTED}`}>{view.tagline}</span> : null}
        </footer>
      </article>
    </>
  )
}
