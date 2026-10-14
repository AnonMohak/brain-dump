/** What routes and the AI pipeline tell the calendar sync. A no-op when sync is off. */
export type CalendarHooks = {
  itemsChanged: (ids: string[]) => void
  eventsOrphaned: (eventIds: (string | null)[]) => void
}

export const NO_CALENDAR: CalendarHooks = {
  itemsChanged: () => {},
  eventsOrphaned: () => {},
}
