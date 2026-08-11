import type React from 'react'

import { AppShell } from '@/components/layout/app-shell'

export default function UnisonLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}

