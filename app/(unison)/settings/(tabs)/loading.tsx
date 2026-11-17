// Shown under the tab bar while a tab loads, so the heading and tabs stay where they are.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
      Loading…
    </div>
  )
}
