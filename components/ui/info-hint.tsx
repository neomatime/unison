'use client'

import { Popover } from '@base-ui/react/popover'
import { Info } from 'lucide-react'

/**
 * A small "i" that explains a term. Opens on hover, on keyboard focus and on a tap or click. The text is portalled to the page, so
 * a table or card that clips its contents never cuts it off.
 */
export function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={80}
        closeDelay={80}
        aria-label={`What is ${label}?`}
        className="inline-flex size-4 items-center justify-center align-middle text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[90]">
          <Popover.Popup className="w-64 border border-border bg-popover p-2.5 text-left text-xs leading-5 font-normal tracking-normal text-popover-foreground normal-case shadow-md outline-none">
            {text}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
