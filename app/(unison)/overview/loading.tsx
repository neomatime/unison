// The Overview's own skeleton, shaped like the dashboard it stands in for, so the
// page does not jump when the data arrives. The group-level loading screen would
// otherwise replace the whole shell content with a spinner.
const block = 'animate-pulse rounded-none bg-muted'

export default function OverviewLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading your CRM overview</span>
      <div aria-hidden="true">
        <div className="mb-5 space-y-3">
          <div className={`${block} h-4 w-40`} />
          <div className={`${block} h-9 w-72 max-w-full`} />
          <div className={`${block} h-4 w-96 max-w-full`} />
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => <div key={index} className={`${block} h-32 border border-border`} />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className={`${block} h-80 border border-border`} />
            <div className={`${block} h-80 border border-border`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={`${block} h-72 border border-border`} />
            <div className={`${block} h-72 border border-border`} />
          </div>
        </div>
      </div>
    </div>
  )
}
