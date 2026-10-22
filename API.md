# Authenticated WebSocket API · version 1

Scheduling Manager retains the `heating_schedule_manager` namespace and storage/config-entry identities for compatibility after the 1.4.0 display/project rename.

Since 1.8.0, get/subscribe/mutation replies additionally include `active_schedules`
(section UUID → current running boolean) and `locations` (authorized entity-setting
UUID → `area_id`, `area_name`, `floor_id`, `floor_name`, each nullable). Location
metadata uses entity Area override → device Area inheritance → Area Floor. These
fields are computed, permission-filtered and never persisted in the schedule model.
Activity uses actual resolved UTC band instants, enabled state and effective Away
suspension. Registry changes publish metadata without changing the model revision.

Every command uses the existing HA authenticated WebSocket and includes an increasing `id` and `type`. There are no public HTTP mutation endpoints or card tokens. HA standard result/error/event envelopes apply.

## Read-only schedule entities

Each saved section is also exposed as a standard HA `binary_sensor` with a UUID-based unique ID. Its state is on only when the section is enabled, has a currently resolved active band and is not suspended by Away. Its attributes include the schedule ID, name/category, enabled/Away state, members and their start/end values, weekday/band configuration (including dynamic solar endpoints), and the next endpoint. Creating, updating or deleting a section adds, updates or removes its entity. These entities are read-only; schedule mutation remains available only through the authenticated WebSocket commands below.

## `heating_schedule_manager/get`

No extra fields. Result:
```json
{
  "model": {"revision": 12, "away": false, "entity_settings": {}, "schedules": []},
  "timezone": "Europe/London",
  "editable": true,
  "status": {},
  "storage_error": null
}
```
Schedule/entity shape is described below. `editable` reflects administrator status. Entity settings, memberships, sections without visible members and status are filtered using the user's entity read permissions. The global revision is unchanged by filtering.

Since integration 1.6.0, results also include `solar_times`: eight HA-local ISO calendar date keys (today through today+7), each mapping `sunrise`, `sunset`, `dawn`, `dusk`, `noon`, `midnight` to an integer local minute or null if that event does not occur. This is computed display data, not part of the persisted model or revision. Location/elevation/timezone changes invalidate calculation caches; ordinary scheduler notifications refresh the table at least daily.

## `heating_schedule_manager/subscribe`

No extra fields. Acknowledges with a result, immediately sends an event with the same shape as `get`, then pushes configuration/Away/error updates. Standard HA `unsubscribe_events` with the `subscription` ID removes the subscription; closing the connection also unsubscribes. Subscriptions do not execute schedules.

## `heating_schedule_manager/capabilities`

Result is an entity-authorized array. Entries include:
```json
{
  "entity_id": "climate.kitchen", "registry_id": null,
  "name": "Kitchen", "kind": "climate", "unit": "°C", "min": 7, "max": 35,
  "step": 0.5, "current": 20, "supported": true,
  "available": true, "reason": null
}
```
Unavailable saved/cached entities can have `available: false`. Unsupported currently available entities include an explanatory `reason`.

Non-climate entries use `kind: state | number | text | date | time | datetime`. State entries expose advertised `options`; numbers expose min/max/step/unit, texts expose length/pattern limits. `current` is a live suggestion and is not persisted with the capability cache. Actions are reconstructed from current server metadata, never accepted as arbitrary client service names. The card lists supported writable choices; read-only domains and this manager's own control are excluded.

## `heating_schedule_manager/save_section` (administrator)

Fields:
- `expected_revision`: nonnegative integer; must match canonical global revision.
- `operation`: explicitly `upsert` or `delete`.
- `section_id`: stable UUID.
- `section`: required for upsert; full section draft, with matching ID.
- `settings`: optional UUID-keyed shared settings updates; may reference only memberships in this draft. Deletes must not send settings updates. Existing entity identity cannot be replaced. New registry identity is resolved by the backend, never trusted from the client.

An upsert section has:
```text
{
  id: UUID, name: nonempty trimmed string, category: string | null,
  enabled: boolean, away_enabled: boolean,
  entities: [
    {entity_key: UUID, target: {value: finite number, unit: "°C" | "°F"}},
    {entity_key: UUID, start_state: string | finite number, end_state: string | finite number}
  ],
  sub_schedules: [{
    id: UUID, name?: trimmed string, days: [0..6],
    bands: [{id: UUID, start_minute: integer, end_minute: integer,
             start_dynamic?: {event: solar_event, offset: integer},
              end_dynamic?: {event: solar_event, offset: integer},
              enabled?: boolean, disabled_until?: ISO_date_time_string}]
  }]
}
```
Shared settings values:
```text
UUID: {entity_id: "climate.…", registry_id: optional registry UUID/null,
       setback: {value: finite number, unit: "°C" | "°F"}}
UUID: {entity_id: "light.…" | other supported entity ID, registry_id: optional registry UUID/null}
```
Days are Monday=0. Enforce 1–7 disjoint nonempty sub-schedules, 1–10 bands each, five-minute fixed endpoints, `0 <= start < end <= 1440` for fixed-only bands, and at least one unique writable membership. Fixed-only bands cannot overlap each other. `1440` displays as 23:59. All UUIDs within each relevant identity collection must be unique. Sections may share entities and overlapping times. Unused shared settings are cleaned only on successful commit.

Dynamic endpoints (1.6.0): each optional definition contains exactly `event` and `offset`. Events are `sunrise | sunset | dawn | dusk | noon | midnight`; offsets are integer minutes from −300 through +300. Absent/null definitions canonicalize to fixed time. The required minute fields remain five-minute fixed anchors for switching back to fixed mode, not cached solar results, and may match/cross when a dynamic definition is present. Runtime resolution uses HA's local date/location and whole-minute solar events, adds offsets, then clamps to 0–1440. **Since 1.6.3, Start always anchors crossing: if Start exceeds End, End becomes Start**, irrespective of which endpoint is dynamic; endpoints never swap. A collapsed band produces only an end occurrence at the common Start instant and is never active. Missing solar events skip the whole band for that date. Solar-driven overlaps follow normal endpoint order/last-command semantics; dynamic configuration is not silently reordered. Save, startup recovery, Enable and Away exit use the same resolver. Schema/storage version 1 is retained as an optional-field extension.

Climate members require temperature targets and shared setbacks. State members require both `start_state` and `end_state`, validated against current capabilities. Numeric state members additionally retain `start_unit` / `end_unit`; missing units on first assignment default to current metadata, while omitted units on updates retain saved units. A unit change requires explicit correction. Non-climate end states are never stored as shared setbacks.

Only this explicit section operation applies. Omitted unrelated sections are never deleted. Proposed shared setback updates are included in the same atomic snapshot. Config revisions, Away state and runtime journal are backend-owned.

New sections are enabled by default. Existing sections missing `enabled` are interpreted as enabled. Section Save preserves the saved enable state; attempts to change it through Save are rejected. Use the explicit immediate action below.

Bands additionally accept optional `enabled` (boolean, default `true`) and
`disabled_until` (ISO date/time string, only valid with `enabled: false`). These
are ordinary draft edits committed through section Save. Omitting the deadline
disables the band permanently. New or changed deadlines must be in the future;
local inputs use HA's timezone and the same DST-gap/fold rules as timed Away.
Saved deadlines are canonical UTC timestamps. Unchanged expired deadlines remain
valid when saving unrelated edits. Storage/schema version 1 is retained.

The card changes band status through section Save. Re-enabling an existing
disabled band applies the newly saved start settings if that particular band is
active at commit time, unless schedule disable or applicable Away suspends it.
New bands, ordinary edits to enabled bands and inactive-band enables do not
synthesize starts. A scheduled boundary start or an already processed timed
expiry is not duplicated. Apply and Cancel perform no configuration mutation;
only Save commits the band-status change and journals any required start.

A band is suspended when `enabled` is false and its deadline is absent or still
in the future. Each endpoint is checked at its actual UTC occurrence, including
downtime recovery. Expiry inside an active occurrence produces one start action
at the deadline; expiry outside its active interval sends no command. At exactly
the band's start, only its ordinary start runs; at its end, only its end runs.
Expiry starts use the ordinary durable event stream and coalesce with later
transitions during downtime recovery. Suspended bands do not count
towards section activity. Changes clear obsolete pending work using the existing
section-save cutover. Section disable and applicable Away mode remain independent
gates. Read-only schedule entity band attributes include the saved `enabled` and
`disabled_until` fields; a past deadline overrides the saved false flag.

`away_enabled` defaults to true for existing/new sections and is a normal section edit committed on Save. Away-disabled sections continue ordinary transitions during global Away. Participating climate entities receive shared setback; participating state entities are suspended without state commands. Saving state memberships during Away never changes them immediately.

`category` (added in 1.3.0) is a trimmed, case-sensitive name or null; an omitted/empty value defaults to unassigned. Categories are derived from saved section assignments, so there is no orphan registry to clean up. A category-only or name-only update retains runtime cursor/history and pending commands; it does not issue temperature/state commands or alter the execution definition. Filtering/sorting are frontend presentation operations and never reorder this API's saved `schedules` array.

Optional sub-schedule `name` is validated as a string, trimmed, and omitted when blank. Unnamed legacy records remain valid. Sub-schedule name-only updates preserve runtime/Away history and pending commands. Execution-changing saves retain unrelated overdue occurrences atomically rather than skipping them when advancing the global cursor.

Success returns canonical `get` state after persistence. Physical-device failures are runtime status, not rollback of an accepted configuration. A storage failure **before** commit leaves configuration/event generations unchanged. A command acknowledgement storage failure after commit is separately reported in `storage_error`.

## `heating_schedule_manager/enable_band` (administrator)

Fields: `expected_revision`, `section_id` (UUID), and `band_id` (UUID).
This immediate operation enables the saved band and removes its disabled-until
deadline. If this particular band is active on its assigned HA-local weekday,
it journals and delivers the saved section's start settings. Outside that band's
active interval, no start action is sent. Enabling is permitted while the section
is disabled or suspended by applicable Away, but those gates suppress its start
action. An already enabled band is an idempotent no-op. There is no `fire_start`
option.

Old-model progress is advanced before the change to avoid replaying a scheduled
start at the enable boundary. A simultaneous automatic expiry is not duplicated
by manual Enable. Success increments the global revision, invalidates
old callbacks and acknowledges durable state before queued device delivery, using
the existing `applying` status. Revision conflicts retain the caller's draft.
This programmatic immediate operation remains available, but the card's dropdown
uses ordinary section Save instead. Cancel cannot undo this API operation.

## `heating_schedule_manager/set_away` (administrator)

Fields: `away` (boolean), `expected_revision` (nonnegative integer), optional `until` (ISO date/time string or null, added in 1.9.0). Offset-free date/time is interpreted in HA's timezone; aware ISO values are absolute. Return times must be future and accompany Away on. The canonical model stores optional `away_until` as UTC ISO. Null makes Away indefinite; omitting until preserves an existing timer when already on. Away off clears it. Updating only the deadline changes revision/timer without device actions or history reset. Stale requests are rejected before the requested mutation; an already-due automatic expiry is processed first. Section Save never carries or overwrites Away.

Expiry disables Away using its real cutover instant and coalesces normal progress after that instant, including downtime. It survives dashboard closure and restarts. Manual off/replacement invalidates stale callbacks. The Away switch exposes `away_until` when timed; external switch on is indefinite when starting and otherwise idempotent.

## `heating_schedule_manager/set_section_enabled` (administrator, added in 1.1.0)

Fields: `section_id` (UUID), `enabled` (boolean), `expected_revision` (nonnegative integer matching the global revision).

Disable persists `enabled: false`, invalidates old callbacks/pending work from the section, applies climate setback and leaves non-climate states unchanged. Disabled sections produce no normal transitions, including catch-up after restart. Enable applies climate targets and state start-values in an active band; outside a band it applies climate setback and leaves state entities unchanged. Band activity uses HA timezone and the same actual DST instants as compilation. The ordinary automatic No Schedule display still sends nothing.

Since backend 1.9.2, explicit Enable/Disable skips already-correct climate targets and rechecks equality at delivery. The WebSocket reply acknowledges persistence before serialized background delivery; `applying` exposes authorized pending work. The journal remains write-before-dispatch and acknowledgements remain durable.

Global Away affects only sections with `away_enabled: true`. Entry queues only needed climate setback changes; included normal endpoints are suspended without repeating setbacks. Exit resumes only active participating schedules in saved order, skipping already-correct climate targets. Inactive/disabled schedules are not commanded. The card's Away API acknowledges after durable commit and delivers pending work asynchronously under the serialized lock; `applying` indicates authorized pending work still being delivered. Errors remain in runtime status. Success returns canonical state with a new revision. Repeating the flag is idempotent. Save/Cancel cannot undo the toggle; stale Saves conflict. Storage failure before commit leaves the flag unchanged.

## Errors

- `unauthorized`: administrator required.
- `not_loaded`: manager has not been set up (`get`).
- `conflict`: stale expected revision; message directs reload/discard while preserving the frontend draft.
- `validation`: invalid input; message begins with a structured field path such as `schedules[0].sub_schedules[1].bands` or `settings`.
- `operation_failed`: storage or other operation error.
- HA `invalid_format`: payload does not match the registered command schema.

The frontend keeps a failed/stale draft open. Cancel performs no WebSocket mutation. Runtime `status` is keyed by shared entity UUID and reports entity ID, message and sequence; it indicates command errors, not room temperature/heating output.
