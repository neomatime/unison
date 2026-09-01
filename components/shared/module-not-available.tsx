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

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <section className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-[0.09em] text-muted-foreground uppercase">Not included</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
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
          className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to Overview
        </Link>
      </section>
    </main>
  )
}
