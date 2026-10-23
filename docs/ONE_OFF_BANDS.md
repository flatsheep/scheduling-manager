# One-off time bands

Choose **One-off** in the Add time band popup. The checkbox starts unchecked;
the text beneath it reads **Will be removed once complete**. Apply changes the
draft; Save activates scheduling. Timeline creation gestures continue to create
ordinary recurring bands. A band's type cannot subsequently be changed.

## Execution

- A shared band runs once across all selected weekdays in Home Assistant's
  timezone. Saving between Start and Stop on a selected day immediately runs the
  remaining interval, then removes the band after Stop resolves. Saving after
  Stop waits for the next selected day. Saving exactly at Start is eligible.
  Previously saved, still-waiting bands created inside an interval are recovered
  against that original day; if Stop has passed, only final Stop is delivered.
- A disabled schedule/sub-schedule or applicable Away skips an unstarted
  occurrence. Re-enabling midway through it does not start a partial cycle.
- If HA returns during the interval, it recovers Start and keeps the original
  Stop deadline. If the entire interval was missed, only final Stop intent is
  delivered; it does not replay a brief Start/Stop cycle or defer another week.
- Selecting an occurrence durably captures its instants, entity membership and
  action values. Start/Stop times remain editable in the popup and timeline.
  Saving edits keeps the same cycle without replaying Start; Stop moves to the
  revised time on the selected occurrence's date, or runs immediately if overdue.
  Waiting bands recalculate eligibility when their times change. Selected
  weekdays and participating entity membership remain fixed. Schedule-level
  action edits do not rewrite the selected occurrence's captured action values.
- Once selected, Stop remains due even when a parent is disabled or Away is
  enabled. Existing parent controls retain their immediate effects. Re-enabling
  or leaving Away does not replay this one-off's Start.
- A successful HA service call resolves delivery; physical state is not verified.
  Failed Stop work retains the band as **Stop pending**, without another Start.
  Recovery/startup retries follow the existing scheduler policy. Successful
  entities are not retried because another entity failed. Newer authoritative
  commands supersede older pending work rather than allowing stale cleanup later.
- A failed Start expires at Stop; Stop is still attempted because a timeout may
  leave the physical outcome uncertain.

## Removal and recovery

Resolved Stop work permanently removes the band's stable ID from the saved
schedule, including every shared weekday. Empty sub-schedules and their parent
configuration remain saved and editable. Deletion increments the model revision
and notifies clients. Open drafts are retained, but stale saves are rejected;
cancel and reopen to reload current saved state.

Manual deletion is allowed before or after Start, including when Stop has failed.
Deleting a band, its sub-schedule or its containing schedule on Save cancels the
one-off and its pending work without issuing device commands. Devices remain as
they are. Cancel leaves saved scheduling unchanged; a failed Save does not cancel
the durable Stop obligation.

Desired actions and occurrence progress are persisted before dispatch. Deletion
write failures retain recoverable progress and retry cleanup without replaying
acknowledged commands. Occurrence recovery is independent of the recurring
scheduler's bounded downtime window and ordinary model revisions.

HA service dispatch and Store persistence cannot form one atomic transaction.
An uncertain command can be retried following a crash between service acceptance
and saving its acknowledgement. Exactly-once physical delivery is not guaranteed.

## Display and controls

The timeline outlines the markers in red, keeping existing Start/Stop fill
colours. A circled **calendar-clock icon** sits above the markers, midway between them, including
in previews. There is no enclosing band box or visible One-off text.
The popup identifies the band with the calendar-clock icon beside **One-off**,
without status/date text or raw action details. Selected solar instants remain frozen across subsequent
solar, timezone or location changes. Captured action values are retained internally.

One-off bands expose no individual disable UI, programmatic disable path or HA
Disabled switch. Direct individual enable/disable requests are rejected. Parent
schedule/sub-schedule controls and Away still apply as described above.

## Calendar boundaries

Existing DST policy is retained: first valid minute after a spring gap, first
occurrence of an autumn fold. Zero-duration or unavailable solar occurrences are
skipped until a valid eligible interval. Fixed bands must end after Start within
the same day. Displayed Stop **23:59** means midnight; true cross-midnight bands
remain unsupported. Adjacent daily bands are independent cycles.
