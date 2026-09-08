import { CalendarEventPage } from '@/features/product-ui/components/calendar-event-page'

export default async function Page({ searchParams }: { searchParams: Promise<{ title?: string; day?: string; time?: string; owner?: string }> }) {
  const values = await searchParams
  return <CalendarEventPage title={values.title ?? 'Calendar event'} day={values.day ?? '11'} time={values.time ?? '09:00'} owner={values.owner ?? 'Neo Morake'} />
}
