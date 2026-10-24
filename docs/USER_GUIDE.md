# Scheduling Manager user guide

[README and installation](../README.md) · [One-off bands](ONE_OFF_BANDS.md) · [API](../API.md)

## Schedules, day groups and devices

A **schedule** combines devices with common Start/Stop times. Each device has its
own actions. A **sub-schedule** assigns one timetable to a group of weekdays:
name groups Weekdays, Weekends or individual days as needed.

Under **Settings → Devices & services → Scheduling Manager**, each schedule
device contains an **Active** binary sensor and a **Disabled** switch. Sub-schedule
devices group their own Disabled switch and recurring-band controls. The separate
**Scheduling Manager** device contains **Away**. These entities are also available
in HA's Entities list for use in dashboards, automations and scripts.

- Each schedule supports 1–7 sub-schedules with disjoint, nonempty weekday sets.
- Each group supports up to ten bands. Empty groups are valid and inactive,
  including those left after their final one-off completes.
- A weekday can appear in different schedules, but only one group per schedule.
- Fixed bands cannot overlap within a group; adjacent bands are allowed.
- Climate entities need a single target-temperature capability. Range-only
  thermostats are not supported.

Use the cog to edit, tap the schedule name to rename, and choose **＋ Entity** to
add devices. Orange values are Start targets/states; blue values are Stop
setbacks/states. Removing a device from a schedule does not change its state.

### Thermostats

Each thermostat has one shared Stop setback throughout the manager, but separate
Start targets for each schedule. Editing a shared setback updates all saved
references on Save. Values retain °C/°F units and are checked against supported
limits and increments; targets do not have to exceed setbacks.

Only `climate.set_temperature` is used. The manager does not change HVAC modes,
presets or on/off state. Unavailable saved devices remain editable using cached
capabilities, with fresh validation at dispatch. Unit changes can require choosing
values again instead of silently reinterpreting them.

### Other writable entities

Start and Stop states/values are both per schedule. Either direction is valid:
a light can start ON and stop OFF, or the reverse.

| Entity types | Controls, where advertised |
| --- | --- |
| Light, switch, input boolean, automation, script, remote, humidifier | ON/OFF |
| Fan, siren | Supported ON/OFF features |
| Cover, valve; lock | OPEN/CLOSED; LOCKED/UNLOCKED |
| Select, input select; water heater | Options; operation modes |
| Number, input number | Values within min/max/step |
| Text, input text | Strings within length/pattern constraints |
| Date, time, datetime, input datetime | Date/time values |
| Media player | Play/pause/stop/off |
| Vacuum, lawn mower | Cleaning/mowing, docking, pause/stop |
| Timer | ACTIVE/PAUSED/IDLE |
| Classic group of supported binary devices | ON/OFF |
| Alarm control panel | Arm/disarm choices not requiring an undisclosed code |

The picker excludes read-only devices, unsupported setters, stateless press-only
actions and the manager's own controls. Mixed groups containing climate/read-only
devices are excluded. Supported choices come from real HA capabilities and actions.

## Editing and saving

**Apply** changes the draft; **Save** commits it. **Cancel** discards unsaved edits.
Band, group, device and schedule deletions also take effect on Save.

Ordinary recurring edits change future events without replaying a historical
Start. One-offs have their own immediate-start and same-cycle editing rules;
see [one-off bands](ONE_OFF_BANDS.md).

Enable/Disable and Away are immediate controls outside the draft. They can make
an open editor stale, as can another client's Save or automatic one-off removal.
The draft is retained, but a stale Save is rejected: inspect it, then cancel and
reopen to load current saved state. Cancel does not undo immediate controls.

### Timeline gestures

- Double-click/tap a blank gap to create a recurring one-hour band when it fits.
  Use **Add time band** for exact times, shorter intervals or the One-off option.
- Holding a blank gap also proposes a band. Scrolling/moving cancels the hold.
- Drag fixed markers or use Left/Right arrow keys for five-minute adjustments.
  Bounds prevent crossing the paired endpoint or fixed neighbours.
- Tap a band/marker or press Enter for its popup. Delete/double-tap offers paired
  band removal with confirmation; the selected marker's tools offer the same actions.
- Overlapping marker taps alternate the foreground marker without changing times.
- Very short bands stagger marker bodies for readability. On phones, scroll the
  timeline horizontally or use the popup for precise entry.

## Fixed and solar times

Fixed selectors use five-minute steps. Stop **23:59** is the special
following-midnight endpoint (`1440`), not a one-minute gap. A true cross-midnight
band is unsupported; use separate daily bands.

Each endpoint independently supports **Solar event**: sunrise, sunset, dawn,
dusk, solar noon or solar midnight, with an integer offset from −300 to +300
minutes. HA calculates these from its configured location, elevation and timezone;
no sun entity is required. Solar midnight is the sun's daily low point.

<img src="images/solar-time-band.png" alt="Solar Start and fixed Stop selectors with an offset and resolved-time preview" width="337">

The popup predicts the event plus offset for the displayed date. If clamping
changes it, **Band time** shows the effective endpoint. Solar labels have a `*`.
Solar endpoints are edited in the popup rather than dragged; a paired fixed
endpoint stays adjustable. View mode resolves today's solar times; day previews
use the next occurrence of that weekday.

Endpoints are clipped to the local day. Start is the anchor: if resolved Stop
precedes Start, Stop collapses onto Start. Recurring collapsed bands issue only
Stop; one-offs skip zero-duration occurrences. A missing solar event skips that
date rather than inventing a fallback. Solar-driven overlaps use ordinary
last-command-wins ordering.

## Pausing and Away

### Whole schedule

The view-mode **Disable** button immediately applies climate setback, leaves
non-climate devices unchanged and suspends new normal transitions. **Enable**
applies active recurring Start settings; outside a band it applies climate setback
and leaves non-climate devices unchanged. Already-correct climate targets are
skipped for these explicit controls.

### Sub-schedules and recurring bands

Use the group's **Disable** button or a recurring band's **Band status** to choose
permanent/timed suspension. Apply, then Save. Disabling leaves devices unchanged;
it does not issue Stop. Timed expiry persists through restarts and resumes Start
once if the recurring interval is active and all parent/Away gates permit it.
Outside an active interval it restores future transitions without a command.

Parent controls preserve each descendant's own disable preference. Enabling a
child never enables its parent. A band shared across weekdays is disabled on all
of them. Bands are greyed out while their sub-schedule is disabled, including in
day previews. Re-enabling the group restores each band's own visual status.
One-offs have no individual disable control and do not resume Start
mid-cycle when a parent is enabled.

### Away

Each schedule can be **Away included** or **Away excluded**. Included is the
default. Header Away and `switch.scheduling_manager_away` control the same saved flag.
The popup offers indefinite Away or **Until…**, in HA's timezone.

Entering Away applies climate setbacks where needed and suspends included normal
transitions. Non-climate devices keep their states; excluded schedules continue.
Returning applies currently active recurring Start settings, without restoring
historical values or replaying one-off Starts. A selected one-off retains its
scheduled Stop cleanup even through Away or parent disabling.

Changing only an Away deadline sends no device command. Expiry is recovered at
its actual cutover if HA was offline. Invalid/past dates and nonexistent local
DST times are rejected. Switching Away off clears the timer; switching it on
when already active preserves an existing deadline.

## Categories, filters and previews

**Category** assigns a saved name or Unassigned. Categories become collapsible
groups; **Hide all / Show all** controls them together. Counts reflect backend
time-band activity, not whether a thermostat currently reports heating.
Grouping and collapsing never change execution order.

**Filter** offers category, area, floor and active/inactive choices. Choices
within a dimension are ORed; different dimensions are ANDed. Area/floor come from
HA's entity/device registries. Green Filter and a red × identify an applied filter;
× clears it. Filters only change the local view and preserve open drafts.

Tap a grey weekday to preview its group's timetable as a dotted overlay. No
schedule or device is changed. Tap the same day, today's group, the background
or Escape to dismiss; previews also close after ten seconds. The numbered/name
badge opens a chooser for other groups. Current grouped days are light green;
unassigned days do nothing when pressed.

## Execution and recovery

- **Last command wins** if multiple schedules share a device. A timetable is not
  continuous ownership: another band's Stop can override an active band's Start.
- Manual device changes remain until the next applicable transition. No Schedule
  and an empty group issue no command; midnight does not invent a Stop.
- Scheduling, desired commands and progress are persisted through HA's Store API.
  Restart recovery coalesces missed events to the newest required state rather
  than replaying every transition. One-off occurrences have durable identities.
- Unavailable/failed devices retain their newest pending command. Recovery,
  startup or a newer transition can retry; there is no periodic enforcement loop.
  Runtime status reports device/storage failures.
- A successful HA service call does not prove physical achievement. A crash after
  service acceptance but before durable acknowledgement can cause a retry.
- All dates use HA's timezone. DST gaps use the first valid minute after the gap;
  repeated autumn times use their first occurrence. Selected one-off instants
  remain fixed unless their times are explicitly edited.

## Troubleshooting and removal

**Card missing after an update?** Restart HA after installing, then refresh the
browser/reopen the app. Remove obsolete scheduler-only `/local/` resources from an
older manual installation; the integration loads its own bundled card.

**Changes will not save?** Check the inline validation or revision-conflict
message. Each retained group needs selected weekdays and the schedule needs at
least one supported entity. Empty groups themselves are valid.

**Device not changing?** Check that the schedule, group and recurring band are
enabled, that Away permits execution and that HA advertises the required action.
Inspect runtime status and integration diagnostics for failures. Manual thermostat
changes and other schedules can legitimately supersede previous commands.

**Removing the integration:** delete its entry under Settings → Devices &
services. This stops scheduling and removes integration entities without changing
device settings. Remove its dashboard card and uninstall in HACS. Saved schedules
are retained if you later add it again; permanent removal and corruption recovery
are documented in [HA standards](../HA_STANDARDS.md#removal-and-recovery).
