# Migrating from 1.x to Scheduling Manager 2.0

Version 2.0 completes the project rename. There is one canonical integration,
`scheduling_manager`, and one card type, `custom:scheduling-manager-card`.

## One-time upgrade

1. Install the 2.0 package through HACS or the release ZIP, then restart HA.
2. Open **Settings → Devices & services → Add integration → Scheduling Manager**.
   Confirm setup once. The new integration detects the 1.x entry and saved data.
3. Wait for setup to finish. The migration stops the old scheduler, transfers its
   saved schedules and execution journal, and migrates entities. The old entry
   remains disabled until the verification restart. Do not delete it yourself.
4. Refresh your browser or reopen the companion app. If a dashboard uses the old
   card type, change it to `custom:scheduling-manager-card`. The bundled card loads
   automatically; remove obsolete scheduler-only manual resources.
5. Update any automation/script references listed below, then **restart HA once
   more to finish the migration**. This commits HA's delayed registry writes
   before the stopped old entry and Store are retired. The migration notice
   clears automatically. An obsolete manual integration
   folder can be removed after successful migration; leave other integrations alone.

HACS manages one integration directory per repository. The 2.0 package therefore
contains only the canonical integration, not a permanent second compatibility
integration. If HA reports the old entry unavailable after the package rename,
adding the new integration as described above performs the handover.

If HACS still looks for the old integration folder or reports a missing manifest
when selecting 2.0, reload the HACS integration under **Settings → Devices &
services**, then select/download 2.0 again. This refreshes its cached repository
path. The release ZIP is also available for manual installation.

## Renamed interfaces

| 1.x | 2.0 |
| --- | --- |
| `custom_components/heating_schedule_manager/` | `custom_components/scheduling_manager/` |
| Action domain `heating_schedule_manager` | `scheduling_manager` |
| WebSocket prefix `heating_schedule_manager/` | `scheduling_manager/` |
| `switch.heating_schedule_away` | `switch.scheduling_manager_away` |
| `custom:heating-schedule-manager-card` | `custom:scheduling-manager-card` |

The old card type, frontend alias filename and action/WebSocket namespace are
removed. The programmatic `schedule_manager.…` control paths do not contain the
old heating name and retain their existing format and UUID references.

## Data and identities

- Schedule, sub-schedule, band and entity-setting UUIDs are preserved.
- Away/timed-disable values, pending commands, acknowledgement progress and
  selected one-off cycles transfer with the original journal. Migration does not
  synthesize a new Start or rearm a completed cycle. Normal downtime recovery
  still delivers outstanding scheduled work.
- HA entity-registry identities and entity customisations are preserved while
  their integration platform and unique-ID prefixes move to the new domain.
  Heating-branded entity IDs, including Away, are renamed. Other custom IDs remain.
- HA cannot move native parent/child devices across integration domains, so the
  hierarchy is recreated under the new integration. Names, areas, labels and
  disabled preferences transfer; entity associations move to the replacement
  devices. Device IDs change, so device-based automations need their targets updated.
- Store and registry changes use supported HA APIs. No direct HA storage/database
  edits are needed. The old schedule Store is removed after successful new
  setup and a verification restart. A small completion receipt allows cleanup
  to resume without overwriting current progress if interrupted.

The migration does not rewrite arbitrary user YAML, templates or external clients.
Update those references explicitly before using the renamed interfaces.

## If migration is interrupted

Retry setup/reload of the new integration rather than starting another migration
or deleting its data. The old scheduler stays stopped so two owners cannot issue
commands. Existing unrelated new-domain data is never overwritten or silently
merged. ID collisions or invalid source data report a setup error for resolution.
