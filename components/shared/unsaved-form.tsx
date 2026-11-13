'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ComponentProps } from 'react'

import { useConfirm } from '@/components/shared/confirm-provider'

/** Warn on leaving edited forms; a failed submission remains dirty. */
export function UnsavedForm(props: ComponentProps<'form'>) {
  const dirty = useRef(false)
  const submitted = useRef(false)
  const confirm = useConfirm()
  const router = useRouter()
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current && !submitted.current) event.preventDefault() }
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a[href]') as HTMLAnchorElement | null
      if (!link || !dirty.current || submitted.current || event.ctrlKey || event.metaKey || event.button !== 0) return
      // Stop the click, ask in UNISON's own dialog, and only then go where the link points.
      event.preventDefault()
      event.stopPropagation()
      const href = link.getAttribute('href') ?? ''
      void confirm({ title: 'Discard your changes?', message: 'You have unsaved changes on this page. If you leave now they are lost.', confirmLabel: 'Discard changes' }).then((leave) => {
        if (!leave) return
        dirty.current = false
        if (link.target === '_blank' || /^(https?:)?\/\//.test(href)) window.location.assign(link.href)
        else router.push(href)
      })
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', leave, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the listeners only need the first confirm and router
  }, [])
  return <form {...props} onChange={(event) => { dirty.current = true; submitted.current = false; props.onChange?.(event) }} onSubmit={(event) => {
    submitted.current = true
    props.onSubmit?.(event)
    // Suppress the warning during a successful redirect; failed actions are editable again.
    window.setTimeout(() => { submitted.current = false }, 1500)
  }} />
}
