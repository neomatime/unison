import { AppShell } from '@/components/layout/app-shell'
import { OverviewScreen } from '@/features/overview/components/overview-screen'

export default function HomePage() {
  return (
    <AppShell>
      <OverviewScreen />
    </AppShell>
  )
}

