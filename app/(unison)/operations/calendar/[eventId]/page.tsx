import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <PhaseFourDetail kind="calendar-event" id={eventId} />
}
