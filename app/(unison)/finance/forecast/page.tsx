import { requireViewOrRedirect } from '@/features/rights/server'
import { ForecastScreen } from '@/features/forecast/components/forecast-screen'

export default async function Page() {
  await requireViewOrRedirect('forecasting')
  return <ForecastScreen />
}
