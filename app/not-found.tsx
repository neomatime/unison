import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested Unison module is not available.
        </p>
        <Link
          href="/overview"
          className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Return to overview
        </Link>
      </section>
    </main>
  )
}
