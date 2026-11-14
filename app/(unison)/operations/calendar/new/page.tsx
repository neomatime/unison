import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions } from '@/features/operations/queries/phase-four'
import { isUuid } from '@/lib/utils'

const clip = (value: string | undefined, length: number) => (value ? value.slice(0, length) : undefined)

// A new event can be started with a title, client and description, as Schedule Engagement on the Overview map does.
export default async function Page({ searchParams }: { searchParams: Promise<{ title?: string; clientId?: string; description?: string; eventType?: string }> }) {
  const params = await searchParams
  const defaults = {
    title: clip(params.title, 200),
    clientId: params.clientId && isUuid(params.clientId) ? params.clientId : undefined,
    description: clip(params.description, 2000),
    eventType: params.eventType === 'Client Meeting' ? 'Client Meeting' : undefined,
  }
  return <PhaseFourForm kind="calendar-event" options={await getPhaseFourOptions()} defaults={defaults} />
}
