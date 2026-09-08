'use client'

import { useEffect, useRef, type ComponentProps } from 'react'

/** Warn on leaving edited forms; a failed submission remains dirty. */
export function UnsavedForm(props: ComponentProps<'form'>) {
  const dirty = useRef(false)
  const submitted = useRef(false)
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current && !submitted.current) event.preventDefault() }
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a[href]')
      if (!link || !dirty.current || submitted.current || event.ctrlKey || event.metaKey || event.button !== 0) return
      if (!window.confirm('Discard your unsaved changes?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', leave, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true) }
  }, [])
  return <form {...props} onChange={(event) => { dirty.current = true; submitted.current = false; props.onChange?.(event) }} onSubmit={(event) => {
    submitted.current = true
    props.onSubmit?.(event)
    // Suppress the warning during a successful redirect; failed actions are editable again.
    window.setTimeout(() => { submitted.current = false }, 1500)
  }} />
}
