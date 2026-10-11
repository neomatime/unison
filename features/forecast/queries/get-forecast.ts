import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { todayInJohannesburg } from '../../payments/fields'
import { buildForecast, type ForecastModel, type ForecastRow } from '../build-forecast'

/** The forecast for the signed-in organisation. A failed read is an error, never an empty forecast. */
export async function getForecast(): Promise<ForecastModel> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.rpc('forecast_months', { p_org: organization.id })
  if (result.error) throw result.error
  return buildForecast((result.data ?? []) as ForecastRow[], todayInJohannesburg())
}
