'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'

type Format = 'CSV' | 'XLSX' | 'PDF'

/**
 * Downloads everything that matches the current filters, across all pages. It asks the export route with the same
 * parameters the page uses and shows the route's message (for example "More than 5,000 rows match…") instead of a file.
 */
export function RegisterExport({ collection, kind, query }: { collection: string; kind: string; query: string }) {
  const [busy, setBusy] = useState<Format | null>(null)
  const [message, setMessage] = useState('')

  async function run(format: Format) {
    setBusy(format)
    setMessage('')
    try {
      const params = new URLSearchParams(query)
      params.delete('page')
      params.set('collection', collection)
      params.set('kind', kind)
      params.set('format', format.toLowerCase())
      const response = await fetch(`/api/records/export?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? 'The export could not be prepared.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `unison-${collection}.${format.toLowerCase()}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Safari and iOS abort the download if the address is revoked straight away.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The export could not be prepared.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Download className="size-3.5" />Export</span>
      {(['CSV', 'XLSX', 'PDF'] as Format[]).map((format) => (
        <button key={format} type="button" disabled={busy !== null} onClick={() => run(format)} className="min-h-10 border border-border px-3 text-xs font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60">
          {busy === format ? 'Preparing…' : format}
        </button>
      ))}
      {message ? <p role="alert" className="w-full text-xs text-destructive">{message}</p> : null}
    </div>
  )
}
