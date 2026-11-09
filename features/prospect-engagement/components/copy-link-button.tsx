'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm font-medium">{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy public URL'}</button>
}

