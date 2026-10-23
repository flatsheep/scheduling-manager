# Scheduling Manager

<a href="https://www.buymeacoffee.com/flatsheep"><img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="40" width="145"></a>

[![Add to HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=flatsheep&repository=scheduling-manager&category=integration)

**A clearer way to manage your Home Assistant schedules.**

Plan heating, hot water, lighting and other supported devices on aligned,
interactive timelines. Scheduling runs inside Home Assistant, even when your
dashboard is closed.

![Scheduling Manager overview with grouped schedules and aligned timelines](docs/images/overview.png)

- **Multiple devices per schedule**, each with its own Start/Stop settings.
- **Named day groups** for weekday, weekend or individual-day routines.
- **Recurring or one-off bands**, with fixed times or solar events and offsets.
- **Visual editing:** drag markers, enter exact times and preview other days.
- **Flexible pauses:** disable schedules, day groups or recurring bands; use Away
  for participating schedules, indefinitely or until a chosen time.
- **HA automation controls**, collapsible categories and area/floor/activity filters.

**Integration and card: 1.12.0 · Home Assistant 2026.7+**
Tested on HA 2026.7.0, 2026.8.1, 2026.9.4 and 2026.10.1.

[Install](#install) · [Quick start](#quick-start) · [One-offs](#one-off-time-bands)
· [Pausing](#pause-schedules-or-bands) · [Automations](#automation-controls)
· [User guide](docs/USER_GUIDE.md)

## Install

One HACS download includes the integration and its matching dashboard card.
No separate JavaScript resource or YAML is needed.

1. In **HACS → ⋮ → Custom repositories**, add
   `https://github.com/flatsheep/scheduling-manager` with category **Integration**.
2. Download **Scheduling Manager**, then **restart Home Assistant**.
3. Open **Settings → Devices & services → Add integration** and add
   **Scheduling Manager**.
4. Add its card to a dashboard. A dedicated **Panel (single card)** view is
   recommended; the view title becomes the card heading.

Refresh your browser or reopen the companion app if the card is not listed yet.
Updates follow the same pattern: download in HACS, restart HA, refresh the dashboard.
Your saved schedules are retained. This is a HACS **custom repository**, not yet a
default-catalogue entry.

<details>
<summary>Manual installation, YAML cards and older installations</summary>

Download [scheduling-manager-1.12.0.zip](https://github.com/flatsheep/scheduling-manager/releases/download/v1.12.0/scheduling-manager-1.12.0.zip),
then extract `custom_components/heating_schedule_manager/` into your HA
configuration directory. Restart HA and add the integration/card as above.

For YAML dashboards:

```yaml
type: custom:scheduling-manager-card
```

The card loads automatically in YAML mode too. Keep the internal installation
folder name `heating_schedule_manager`; existing schedules, automation identities
and `custom:heating-schedule-manager-card` aliases remain compatible.

If upgrading an older manual installation, keep the existing integration and
remove only obsolete `/local/scheduling-manager-card.js` or
`/local/heating-schedule-manager-card.js` dashboard resources. Do not delete and
re-add the integration or its saved schedules.

</details>

## Quick start

1. Choose **＋ Schedule**, name it, then use **＋ Entity** to add devices.
   Orange is **Start/target**; blue is **Stop/setback**.
2. Select the weekdays that share a routine and optionally name the sub-schedule.
   Use the **＋ beside the dropdown** for a different group, such as weekends.
3. Choose **＋ Add time band**, set Start and Stop, then **Apply**. You can also
   double-click/tap a blank timeline gap to create a recurring one-hour band.
4. Choose a **Category** and **Away included/excluded**, then **Save**.

![Named Weekdays sub-schedule with weekday selection and Disable control](docs/images/sub-schedule-days.png)

**Apply edits the draft; Save activates it. Cancel discards unsaved changes.**
Open a schedule's cog to edit it again. Each weekday belongs to one sub-schedule
within that schedule, with up to seven groups and ten bands per group.

<img src="docs/images/time-band-creation.png" alt="Time-band creation popup with Start, Stop, solar options, Band status and the One-off checkbox" width="280">

Drag fixed-time markers in five-minute steps, or open their popup for precise
editing. Tick **Solar event** at either endpoint for sunrise, sunset, dawn, dusk,
solar noon or solar midnight, with an offset of up to ±300 minutes.

Tap a grey weekday in view mode to preview its timetable without changing devices.
Use **Category** and **Filter** to organise schedules or show only matching areas,
floors and active/inactive routines.

## One-off time bands

For a temporary routine, tick **One-off** when creating a band. Its red marker
borders and calendar-clock badge show that it will expire.

<img src="docs/images/one-off-time-band.png" alt="One-off band with red-bordered Start and Stop markers and a circled calendar-clock badge" width="195">

- It runs **one cycle across the selected weekdays**, then is removed from every
  associated day after Stop resolves. An empty day group is retained for reuse.
- Save during today's selected interval to **start immediately** and use its
  remaining time. If Stop has already passed, it waits for the next selected day.
- Times remain editable. Changing a running band's times keeps the same cycle
  without repeating Start; an overdue edited Stop runs on Save.
- Deletion is always available. Save cancels its remaining work without issuing
  device commands. A recurring band cannot be converted into a one-off later.

One-offs have no individual disable switch or automation path. Parent controls
still apply, but a selected cycle retains its Stop cleanup through disabling or
Away. Failed Stops remain pending rather than silently expiring.
See [one-off behaviour and recovery](docs/ONE_OFF_BANDS.md).

## Pause schedules or bands

| Control | What it does |
| --- | --- |
| **Schedule Enable/Disable** | Immediate. Disable applies climate setback, leaves other devices unchanged and pauses new transitions. |
| **Sub-schedule Disable** | Pauses a day group's bands permanently or until a chosen time. Apply, then Save. |
| **Recurring Band status** | Disables only that shared band, permanently or until a chosen time. Apply, then Save. |
| **Away** | Pauses participating schedules now, indefinitely or until an automatic return. Excluded schedules continue. |

| Permanent day-group pause | Timed day-group pause |
| --- | --- |
| <img src="docs/images/sub-schedule-disabled.png" alt="Sub-schedule popup set to Disabled permanently" width="280"> | <img src="docs/images/sub-schedule-disabled-until.png" alt="Sub-schedule popup with Disabled until and a re-enable date/time" width="280"> |

Disabled day groups show black weekday buttons with a red ×; disabled recurring
bands stay dark grey. Disabling either leaves devices unchanged. Enabling or timed
expiry applies Start only inside an eligible active recurring interval, respecting
parent controls and Away.

![Disabled weekdays with black buttons and red crosses](docs/images/disabled-weekdays.png)

Away applies setback to participating thermostats and leaves non-climate devices
unchanged. Returning resumes currently active **recurring** routines, without
replaying one-off Starts. Dates and times use **Home Assistant's timezone**.

## Automation controls

Schedules, sub-schedules and recurring bands expose native **Disabled** switches:
**on = disabled; off = enabled**. Find their entity IDs under
**Settings → Devices & services → Entities**.

Schedules and their sub-schedules are grouped as parent/child devices on HA 2026.9+:

![Home Assistant device hierarchy showing Bedroom and Guest Bedroom schedules with their Everyday sub-schedules](docs/images/schedule-device-hierarchy.png)

```yaml
action: switch.turn_on
target:
  entity_id: switch.schedule_manager_schedule1_disabled
```

Use your actual entity ID. Away has its own `switch.heating_schedule_away`.
For boolean path controls, UUID-stable references and examples, see the
[API reference](API.md#programmatic-disabled-controls-added-in-1110).

## Good to know

- **Manual changes last until the next relevant transition.** There is no
  continuous enforcement loop. If schedules share an entity, the last command wins.
- **Thermostats use temperature commands only.** HVAC modes and presets are not
  changed. Start targets are per schedule; each thermostat's Stop setback is shared.
- **Other writable entities** use their real HA actions and advertised options:
  switches/lights, covers, selects, numbers, text, date/time values and more.
  Read-only and unsupported devices are excluded.
- **23:59 as Stop means following midnight.** A band cannot wrap midnight; use
  separate daily bands for an overnight routine.
- **Restart recovery keeps the latest required state**, rather than replaying
  every missed transition. Service acceptance is not proof of physical delivery.
- **Stale drafts are retained, not overwritten.** If another save or automatic
  expiry changes the revision, cancel and reopen before saving your edits.

## Guides and project information

- [User guide](docs/USER_GUIDE.md): editing, supported devices, pausing and troubleshooting.
- [One-off specification](docs/ONE_OFF_BANDS.md): execution, time edits and restart recovery.
- [API reference](API.md): authenticated commands and automation paths.
- [Test results](TEST_RESULTS.md) · [HA standards and removal/recovery](HA_STANDARDS.md).
- [Development](docs/DEVELOPMENT.md) · [Releases](https://github.com/flatsheep/scheduling-manager/releases).

Developed with substantial AI assistance using **OpenCode**, with requirements,
design and behaviour directed by the maintainer. Verification includes automated
tests and use in a real Home Assistant installation.

Licensed under **GNU GPL v3.0**. See [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
