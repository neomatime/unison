import { Info } from 'lucide-react'

/**
 * A small "i" that explains a term. Opens on hover and on keyboard focus (and on a tap, which focuses the button), so it works
 * without a mouse. The text is also the button's accessible description.
 */
export function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute top-full left-0 z-30 mt-1.5 hidden w-64 border border-border bg-card p-2.5 text-left text-xs leading-5 font-normal tracking-normal text-foreground normal-case shadow-md group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  )
}
