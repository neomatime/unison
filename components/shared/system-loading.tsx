type SystemLoadingProps = {
  variant?: 'workspace' | 'fullscreen'
  label?: string
  context?: string
}

export function SystemLoading({
  variant = 'workspace',
  label = 'Preparing your workspace',
  context = 'UNISON',
}: SystemLoadingProps) {
  const content = (
    <div role="status" aria-live="polite" aria-busy="true" className="unison-system-loading w-full">
      <span className="sr-only">{label}</span>

      <header className="flex items-center justify-between border-b border-border/80 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <LoadingMark />
          <div>
            <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-brand uppercase">{context}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
        <div aria-hidden="true" className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span key={index} className="unison-loading-dot size-1.5 bg-brand/65" style={{ animationDelay: `${index * 160}ms` }} />
          ))}
        </div>
      </header>

      <div aria-hidden="true" className="p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <Skeleton className="h-3 w-28" delay={0} />
            <Skeleton className="mt-3 h-8 w-[min(25rem,78%)]" delay={70} />
            <Skeleton className="mt-3 h-3.5 w-[min(34rem,92%)]" delay={120} />
          </div>
          <div className="hidden items-start justify-end gap-2 xl:flex">
            <Skeleton className="h-10 w-44" delay={80} />
            <Skeleton className="size-10" delay={130} />
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="border border-border/80 bg-card p-4">
              <Skeleton className="h-2.5 w-20" delay={index * 55} />
              <Skeleton className="mt-4 h-7 w-16" delay={80 + index * 55} />
              <Skeleton className="mt-3 h-2.5 w-28" delay={140 + index * 55} />
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden border border-border/80 bg-card">
          <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
            <Skeleton className="h-3 w-36" delay={120} />
            <Skeleton className="h-8 w-24" delay={180} />
          </div>
          <div className="divide-y divide-border/70">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="grid grid-cols-[1.5fr_1fr_0.7fr] gap-5 px-5 py-4">
                <Skeleton className="h-3 w-full" delay={index * 65} />
                <Skeleton className="h-3 w-4/5" delay={70 + index * 65} />
                <Skeleton className="h-3 w-3/5" delay={130 + index * 65} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  if (variant === 'fullscreen') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
        <div aria-hidden="true" className="unison-loading-aura absolute inset-0" />
        <div className="relative w-full max-w-5xl border border-border bg-card">{content}</div>
      </main>
    )
  }

  return <section className="overflow-hidden border border-border bg-card">{content}</section>
}

function LoadingMark() {
  return (
    <span aria-hidden="true" className="relative flex size-9 items-center justify-center border border-brand/25 bg-brand/[0.04]">
      <span className="unison-loading-ring absolute inset-1 border border-brand/35" />
      <span className="h-3.5 w-px bg-brand" />
      <span className="absolute h-px w-3.5 bg-brand" />
    </span>
  )
}

function Skeleton({ className, delay }: { className: string; delay: number }) {
  return <div className={`unison-luxury-skeleton ${className}`} style={{ animationDelay: `${delay}ms` }} />
}
