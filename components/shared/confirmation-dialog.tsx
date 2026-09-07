'use client'

export function ConfirmationDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="presentation" onMouseDown={onCancel}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()} className="unison-dialog-enter w-full max-w-md rounded-none border border-border bg-card p-6 shadow-2xl">
        <h2 id="dialog-title" className="unison-section-title text-sm text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-none border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-none bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90">{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
