import { Building2 } from 'lucide-react'

export default function Loading() {
  return (
    <div aria-label="Loading organisation profile" aria-busy="true" className="animate-pulse space-y-5">
      <div className="flex items-start justify-between gap-5">
        <div className="space-y-3">
          <div className="h-3 w-60 bg-muted" />
          <div className="h-8 w-80 bg-muted" />
          <div className="h-4 w-96 max-w-full bg-muted" />
        </div>
        <div className="hidden h-10 w-40 bg-muted sm:block" />
      </div>
      <div className="flex min-h-36 items-center border border-border bg-card p-6">
        <span className="flex size-20 items-center justify-center bg-muted text-muted-foreground">
          <Building2 className="size-7" />
        </span>
        <div className="ml-5 space-y-3">
          <div className="h-6 w-48 bg-muted" />
          <div className="h-4 w-72 max-w-full bg-muted" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 border border-border bg-card" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="h-96 border border-border bg-card xl:col-span-6" />
        <div className="h-96 border border-border bg-card xl:col-span-3" />
        <div className="h-96 border border-border bg-card xl:col-span-3" />
      </div>
    </div>
  )
}
