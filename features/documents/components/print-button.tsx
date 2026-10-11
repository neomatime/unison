/** Opens the bare print page in a new tab; its print dialog offers printing or saving as a PDF. */
export function PrintButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground">
      Print or save as PDF
    </a>
  )
}
