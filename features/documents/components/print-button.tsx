'use client'

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground">
      Print or save as PDF
    </button>
  )
}
