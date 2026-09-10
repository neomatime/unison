'use client'

import { Download, Import } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ExportDialog } from '@/components/shared/export-dialog'
import type { PortableCollection } from '../portable-collections'

export function DataPortabilityActions({ collection, title, returnHref, recordIds, allowImport = true }: { collection: PortableCollection; title: string; returnHref: string; recordIds: string[]; allowImport?: boolean }) {
  const [exportOpen, setExportOpen] = useState(false)
  return <>
    <div className="mb-3 flex justify-end gap-2">
      {allowImport ? <Link href={`/records/${collection}/import?collection=${collection}&return=${encodeURIComponent(returnHref)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold"><Import className="size-3.5" />Import</Link> : null}
      <button type="button" onClick={() => setExportOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold"><Download className="size-3.5" />Export</button>
    </div>
    <ExportDialog open={exportOpen} title={title} collection={collection} visibleIds={recordIds} selectedIds={[]} onClose={() => setExportOpen(false)} />
  </>
}
