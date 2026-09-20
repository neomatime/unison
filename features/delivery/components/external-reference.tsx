import type { ReactNode } from 'react'

import type { DeliveryItem } from '../delivery-item-tree'

// Deliberately NOT a 'use client' module: the delivery item's detail page is a
// Server Component and calls this directly, and a function exported from a
// 'use client' file cannot be called from the server. It is used from both that
// page and the client-side delivery panel, which is what this file being
// directive-free allows.
//
// Always rendered as a row, matching how 'Current phase' and 'Target date'
// show an empty label rather than omitting the row when unset -- an absent
// external reference reads the same way, not as a special "not linked" case.
// The empty label is a parameter because the panel uses an em dash and the
// detail page uses "Not set".
export function externalReferenceValue(item: DeliveryItem, emptyLabel: ReactNode = '—'): ReactNode {
  const label = [item.sourceSystem, item.externalReference].filter(Boolean).join(' · ')
  if (!label && !item.externalUrl) return emptyLabel
  if (!item.externalUrl) return label
  return (
    <a href={item.externalUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">
      {label || item.externalUrl}
    </a>
  )
}
