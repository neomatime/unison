import Image from 'next/image'

import { cn } from '@/lib/utils'

/**
 * The UNISON wordmark as an image: navy on a light page, white on a dark one. Both are in the page; the one that does not
 * match the theme is hidden by CSS, so there is no flash and no script. `white` forces the white one (for use on a photo or
 * another dark panel). Give it a height (for example "h-5"); the width follows.
 */
export function UnisonWordmark({ className, white = false, priority = false }: { className?: string; white?: boolean; priority?: boolean }) {
  if (white) return <Image src="/brand/unison-wordmark-white.png" alt="UNISON" width={1000} height={96} priority={priority} className={cn('h-5 w-auto', className)} />
  return (
    <>
      <Image src="/brand/unison-wordmark.png" alt="UNISON" width={1000} height={96} priority={priority} className={cn('h-5 w-auto dark:hidden', className)} />
      <Image src="/brand/unison-wordmark-white.png" alt="" aria-hidden="true" width={1000} height={96} priority={priority} className={cn('hidden h-5 w-auto dark:block', className)} />
    </>
  )
}
