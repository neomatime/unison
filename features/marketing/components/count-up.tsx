'use client'

import { useEffect, useRef, useState } from 'react'

/** A number that counts up to its value, slowly decelerating, the first time it is seen. Shows the final value at once under reduced motion. */
export function CountUp({ value, duration = 1800, delay = 0, prefix = '', suffix = '', decimals = 0 }: { value: number; duration?: number; delay?: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setShown(0)
    let frame = 0
    let timer = 0
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      timer = window.setTimeout(() => {
        const start = performance.now()
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - progress, 4)
          setShown(value * eased)
          if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      }, delay)
    }, { threshold: 0.4 })
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [value, duration, delay])

  return <span ref={ref}>{prefix}{shown.toFixed(decimals)}{suffix}</span>
}
