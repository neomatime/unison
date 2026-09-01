import type React from 'react'

import { ModuleGate } from '@/components/shared/module-gate'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleId="invoices">{children}</ModuleGate>
}
