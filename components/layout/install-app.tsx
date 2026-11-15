'use client'

import { useCallback, useEffect, useState } from 'react'

// The browser's own install prompt, kept until the person asks for it. Chrome, Edge and other Chromium browsers fire
// "beforeinstallprompt" when the site can be installed; Safari and Firefox never do, so they get the written steps in Help.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: InstallPromptEvent
  }
}

let held: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((listener) => listener())

let attached = false
function attach() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    held = event
    tell()
  })
  window.addEventListener('appinstalled', () => {
    held = null
    tell()
  })
}

// Start listening as soon as this file loads, because the browser can fire the event before any component has mounted.
attach()

/** True when UNISON is already running as an installed app (its own window), where an install button would make no sense. */
export function isRunningAsApp() {
  if (typeof window === 'undefined') return false
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standalone || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches
}

/** Whether the browser can install UNISON right now, and the action that does it. */
export function useInstallApp() {
  const [available, setAvailable] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    attach()
    const sync = () => {
      setAvailable(held !== null)
      setInstalled(isRunningAsApp())
    }
    sync()
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const install = useCallback(async () => {
    if (!held) return
    const prompt = held
    held = null
    tell()
    await prompt.prompt()
    await prompt.userChoice.catch(() => undefined)
  }, [])

  return { canInstall: available && !installed, installed, install }
}
