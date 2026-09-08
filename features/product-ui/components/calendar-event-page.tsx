'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'

export function CalendarEventPage({ title, day, time, owner }: { title: string; day: string; time: string; owner: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); sessionStorage.setItem(`unison:calendar-event:${title}`, JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))); window.setTimeout(() => { setSaving(false); setDone(true) }, 350) }
  return <WorkPage category="Operations" title="Edit calendar event" description="Update schedule, ownership and delivery context in a dedicated workspace." parent={{ label: 'Calendar', href: '/operations/calendar' }} guidance={<><p className="font-semibold text-foreground">Calendar context</p><p className="mt-2">Keep the owner and timing clear so connected delivery work remains easy to coordinate.</p></>}>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Event updated</h2><p className="mt-2 text-sm text-muted-foreground">The current UI session reflects this calendar change.</p><button type="button" onClick={() => router.push('/operations/calendar')} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to calendar</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card"><header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">Calendar event</p><h2 className="mt-2 text-lg font-semibold">Event details</h2></header><div className="grid gap-5 p-6 sm:grid-cols-2 lg:p-8"><Field name="title" label="Title" value={title} span /><Field name="date" label="Date" type="date" value={`2026-08-${day.padStart(2, '0')}`} /><Field name="time" label="Time" type="time" value={time} /><Field name="owner" label="Owner" value={owner} /><Field name="location" label="Location" value="HIMARK Workspace" /><label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" rows={5} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label></div><footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.back()} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save event'}</button></footer></UnsavedForm>}
  </WorkPage>
}

function Field({ name, label, value, type = 'text', span = false }: { name: string; label: string; value: string; type?: string; span?: boolean }) { return <label className={`text-sm font-medium ${span ? 'sm:col-span-2' : ''}`}>{label}<input name={name} type={type} required defaultValue={value} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label> }
