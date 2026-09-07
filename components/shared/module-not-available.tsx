import Link from 'next/link'

import { moduleById } from '@/features/product-ui/registry'
import { getTier, lowestTierIncluding, type UnisonModuleId, type UnisonTierId } from '@/config/unison-tiers'

/**
 * Every value is derived. Naming the module means the page confirms it exists,
 * which is acceptable: the tier list is public product information, and whoever
 * typed the URL usually wants the module.
 */
export function ModuleNotAvailable({ moduleId, tier }: { moduleId: UnisonModuleId; tier: UnisonTierId }) {
  const label = moduleById[moduleId]?.label ?? moduleId
  const current = getTier(tier)
  const upgrade = lowestTierIncluding(moduleId)

  // A plain wrapper, not <main>: this renders inside AppShell's <main>, and
  // nesting one inside the other is invalid HTML and a second landmark.
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <section className="max-w-md rounded-none border border-border bg-card p-8 text-center">
        <p className="unison-metric-label text-xs text-muted-foreground">Not included</p>
        <h1 className="unison-page-title mt-2 text-xl text-foreground">
          {label} isn&rsquo;t part of {current.label}
        </h1>
        {upgrade ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Available on {upgrade.label}. Ask your UNISON administrator to upgrade.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Ask your UNISON administrator for access.</p>
        )}
        <Link
          href="/overview"
          className="mt-6 inline-flex rounded-none bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to Overview
        </Link>
      </section>
    </div>
  )
}
