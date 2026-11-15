'use client'

import { createContext, useContext } from 'react'

import type { CalendarEvent } from '../model'

export type EventFormTab = 'details' | 'scheduler'

/** The event's time, shared by the form's two tabs so a change in one shows in the other. */
export type Schedule = {
  start: string
  end: string
  events: CalendarEvent[]
  ignoreId?: string
  /** Moving the start moves the end with it, keeping the length. */
  changeStart: (value: string) => void
  setEnd: (value: string) => void
  /** Both at once, as the scheduler does. */
  setRange: (start: string, end: string) => void
  tab: EventFormTab
  setTab: (tab: EventFormTab) => void
}

export const ScheduleContext = createContext<Schedule | null>(null)

export function useSchedule(): Schedule {
  const value = useContext(ScheduleContext)
  if (!value) throw new Error('useSchedule is used inside EventFormTabs')
  return value
}
