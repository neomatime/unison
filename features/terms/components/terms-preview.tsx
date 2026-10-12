import type { ResolvedTerms } from '../resolve-terms'

/** The terms as a client would read them, with a clear warning for anything a placeholder left out. */
export function TermsPreview({ preview, label }: { preview: ResolvedTerms; label: string }) {
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-xs text-[var(--briefing-muted)]">{label}</p>
      {preview.skipped.length > 0 ? (
        <div role="status" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Left out of this preview because a value is not available: {preview.missing.map((name) => `{{${name}}}`).join(', ')}</p>
          <ul className="mt-1 list-disc pl-4">
            {preview.skipped.map((line, index) => <li key={`${index}-${line}`} className="break-words">{line}</li>)}
          </ul>
        </div>
      ) : null}
      {preview.inclusions.length > 0 ? (
        <section>
          <h3 className="unison-section-title text-xs text-foreground">Service inclusions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {preview.inclusions.map((line, index) => <li key={`${index}-${line}`} className="break-words">{line}</li>)}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="unison-section-title text-xs text-foreground">Terms and conditions</h3>
        {preview.lines.length > 0 ? (
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            {preview.lines.map((line, index) => <li key={`${index}-${line}`} className="break-words">{line}</li>)}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[var(--briefing-muted)]">There is no wording yet.</p>
        )}
      </section>
    </div>
  )
}
