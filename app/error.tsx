'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Unison could not load this screen. Try the request again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </section>
    </main>
  )
}

