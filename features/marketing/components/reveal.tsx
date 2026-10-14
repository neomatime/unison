'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Marks its content as "in view" the first time it scrolls into view (data-in), which the motion rules in
 * styles/globals.css react to. `rise` also fades and lifts the wrapper itself; `plain` only sets the flag so the
 * elements inside (masked headline lines, hairlines, the preview) animate by themselves.
 * Without JavaScript the landing page's <noscript> rule shows everything, and under reduced motion the CSS does.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'rise',
  threshold = 0.15,
}: {
  children: ReactNode
  className?: string
  delay?: number
  variant?: 'rise' | 'plain'
  threshold?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return (
    <div
      ref={ref}
      data-in={visible ? '' : undefined}
      className={cn(variant === 'rise' && 'lux-reveal', className)}
      style={{ '--lux-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
