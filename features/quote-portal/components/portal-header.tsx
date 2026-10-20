import { Lock } from 'lucide-react'

import { PORTAL_SECURE_LABEL } from '@/features/quote-portal/copy'

/** The top of every portal page: the wordmark and the secure-portal indicator. No navigation. */
export function PortalHeader() {
  return (
    <header className="flex items-center justify-between gap-3 py-2 sm:gap-4 sm:py-3">
      {/* The wordmark file has an empty margin round the letters; the negative margins trim it so the letters sit on the page edge.
          It is smaller on a phone so that the header never makes the page wider than the screen. */}
      <img
        src="/brand/himark-wordmark.png"
        alt="HIMARK"
        width={2163}
        height={727}
        className="-my-4 -ml-4 h-16 w-auto shrink-0 sm:-my-6 sm:-ml-7 sm:h-28"
      />
      <p className="flex min-w-0 items-center gap-2 text-xs leading-tight text-[var(--briefing-muted)] sm:text-sm">
        <Lock aria-hidden="true" className="size-4 shrink-0 text-brand" />
        <span>{PORTAL_SECURE_LABEL}</span>
      </p>
    </header>
  )
}
