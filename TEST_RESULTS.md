# Verification results

## Release 2.0.3: HACS installation and README presentation

- Packages the README changes already on main: search in HACS's default catalogue
  first, custom-repository fallback instructions, a 20% smaller right-aligned
  coffee button, and the Open in HACS shortcut below the main installation steps.
- HACS loads the README from the installed/latest release rather than necessarily
  from main. Publishing this patch makes those changes available in release-specific
  documentation without changing the existing v2.0.2 tag.
- Integration/card versions and loader cache keys are aligned at **2.0.3**.
  Scheduler logic and the built card payload are unchanged from **2.0.2**.
- Production frontend build and all **26 unit tests** passed. The two focused HA
  frontend registration/payload checks and the HACS-only installation/served-card
  check passed in an isolated HA 2026.10.1 container with networking disabled.
  The release's full GitHub CI matrix runs before publication.

## Release 2.0.2: async timezone loading and durable timeout failures (2026-10-24)

- Addressed the review finding by resolving HA's configured timezone with
  `await dt_util.async_get_time_zone(...)`, retaining the object and passing it
  through scheduling, one-off, activity, solar and local-deadline helpers. No
  integration module constructs `ZoneInfo` directly. Timezone cutover retains
  serialized persistence; superseded resolutions and failed writes cannot replace
  the active resolved timezone with inconsistent state.
- Astral is loaded through HA's async import helper before first-use solar work.
  A fresh-process audit checks actual native file-open/directory events, including
  cold timezone files and Astral modules. Startup, Save, reads, local deadlines and
  timezone changes produced no integration loop I/O, integration warnings/errors
  or HA blocking-call reports in this audit on all four supported HA versions.
- Empty exception messages now remain failures with fallback text. A timed-out
  one-off Stop stays pending across restart and completes on service recovery
  without repeating Start. Empty-message storage failures remain visible too.
- **237 backend tests across 13 suites passed** in isolated network-disabled
  containers on HA **2026.7.0**, **2026.8.1**, **2026.9.4** and **2026.10.1**.
  Combined line/branch coverage on HA 2026.8.1 is **96.29%**, above the unchanged
  **95.1%** gate. The subprocess-only cold-cache test runs outside the parent
  coverage wrapper, avoiding misleading no-data warnings.
- Ruff, all ten selected formatting checks, mypy across all 22 integration modules
  and pinned official hassfest passed (one integration, zero invalid integrations).
  Updated stale standards/device-checklist documentation and the benchmark's
  timezone inputs.
- Integration/card versions are aligned at **2.0.2**. The release also includes
  the dashboard reconnect/startup recovery and touch-popup fixes already on main.
  Both the registered outer-loader URL and its inner import use the new version
  so clients can pick up the release without retaining the old loader URL.
- The 2.0.2 production frontend build, **26 unit tests**, all **88 Chromium tests**
  and the isolated HACS-only installation/served-card check passed. Ruff, selected
  formatting, mypy and pinned hassfest were rechecked after the version bump.
- Publication and renewed review were subsequently authorised. No production
  installation or HA restart is part of this release preparation.

## Release 2.0.1: native activity/Away device visibility

- Read-only inspection found eight enabled activity sensors and the enabled Away
  switch without device associations. Schedule devices therefore showed only
  their Disabled control.
- Activity sensors now attach to their schedule device as **Active**, retaining
  their existing entity IDs and unique IDs. Away attaches to a separate
  **Scheduling Manager** service device. User entity names/icons/labels are retained.
- Seven focused HA checks passed, covering existing-entity attachment, activity
  state, translated Away naming, hierarchy upgrades, cleanup, domain migration and
  HA 2026.7 compatibility. Ruff, selected formatting, mypy and hassfest passed.
- Installed four targeted backend/translation files and performed one explicitly
  authorised restart. HA 2026.10.1 loaded cleanly at saved revision **134**.
  The model and all **43 entity-registry identities/customisations** were preserved.
  All eight activity sensors now share their schedule's device with Disabled;
  Away is on the new manager device, for **19 devices** total. Existing device
  identities/customisations were retained, native states match scheduler state,
  and no scheduler errors were reported. No physical-device tests were performed.

## Release 2.0.0: canonical naming and 1.x migration

- Canonical integration folder, domain, actions, WebSocket namespace, Store and
  entity unique-ID prefix now use `scheduling_manager`. Away uses
  `switch.scheduling_manager_away`. The old card tag, alias file and static route
  are removed; old-name handling is isolated to migration code/tests/upgrade docs.
- **230 backend tests across 12 suites** passed in isolated network-disabled
  containers on HA **2026.7.0**, **2026.8.1**, **2026.9.4** and **2026.10.1**.
  This includes **16 real HA migration cases**: live unload, native child-device
  recreation, identity/customisation preservation, pending/unavailable work,
  selected one-off progress, collisions, missing old package, orphaned data,
  interrupted Store/registry/cleanup writes, and restart-gated retirement.
- Combined line/branch coverage on HA 2026.8.1: **96.26%**, retaining the existing
  95.1% gate. The migration leaves a small completion receipt for idempotent cleanup.
- Frontend production build, **26 unit tests** and **84 Chromium tests** passed,
  including canonical-only registration and inherited disabled-band styling.
  Ruff lint, selected formatting, mypy and official hassfest passed.
- The handover keeps the old entry stopped and retains its Store until a
  verification restart commits HA's delayed entity/device registry writes.
  Native device IDs are recreated using supported APIs; schedule UUIDs and
  HA entity-registry identities are retained. User metadata added after initial
  handover is preserved across verification.
- Deployed locally with exactly **two explicitly authorised restarts**. HA
  **2026.10.1** is RUNNING with only `scheduling_manager` loaded. Saved model and
  revision **132** were preserved. All **43 entity-registry identities**, entity
  customisations and **18 devices' customisations** transferred; device hierarchy
  IDs were recreated as documented. All **34 Disabled controls** remain available.
- Away is now `switch.scheduling_manager_away`. The old config entry and verified
  obsolete integration folder were retired; its frontend route returns 404 and
  only the new action namespace is registered. Served frontend bytes match the
  build, production configuration validation is valid, migration notices cleared,
  and scheduler storage/device/log errors are zero.
- All four storage dashboards were inspected through supported APIs; none needed
  a legacy card-type rewrite, and no dashboard/resources were changed. Verification
  did not test physical devices. No direct HA storage/database edits, deployment
   backups or HACS-submission changes were made for this migration.

## Release 1.12.0: one-offs, sub-schedule controls and documentation

- Release-candidate backend validation on isolated HA **2026.8.1** passed all
  **214 tests across 11 suites**, including 32 one-off cases. Combined
  line/branch coverage is **96.47%**, above the unchanged 95.1% gate.
- Production frontend build, **26 unit tests** and all **82 Chromium tests**
  passed with matching integration/card version **1.12.0**.
- Ruff lint, all ten repository-selected formatting checks, gradual mypy and
  official hassfest passed (one valid integration, zero invalid).
- Documentation link checks passed. The manual-install ZIP contains 65 files,
  including all public guides and seven supplied screenshots, with safe paths,
  valid CRCs and byte-identical payloads. Repeated packaging produced identical
  ZIP bytes; no local HA configuration, caches or installation records are included.
- The README is condensed into installation, quick-start and feature essentials.
  Detailed guidance is in `docs/USER_GUIDE.md`, `docs/ONE_OFF_BANDS.md` and
  `docs/DEVELOPMENT.md`. All seven updated documentation images are the
  maintainer-supplied originals, including native parent/child device grouping.
- Existing local deployment checks are recorded below. Publication changes do
  not restart or alter the running production installation.

## One-off manual deletion and time editing (2026-10-23)

- Removed the selected-occurrence deletion and time-edit restrictions. Manual
  deletion cancels remaining work without device commands, including a failed
  Stop. Time edits keep the same cycle, preserve Start history and captured
  actions, and move Stop on the selected date. Overdue edited Stops execute on
  Save. The popup, keyboard and pointer timeline editors support time changes.
- **32 one-off backend tests**, **52 backend regressions**, **33 band tests**
  and **16 sub-schedule tests** passed on isolated HA 2026.10.1. New cases cover
  deleting running/failed bands, containing schedule/sub-schedule deletion,
  extended/overdue Stop edits, stale retry cancellation, failed persistence,
  restart recovery and unrelated same-boundary commands.
- Production frontend build, **26 unit tests**, **5 focused Chromium tests**,
  Ruff and mypy passed. No broad compatibility matrix was repeated for this fix.
- Installed three targeted integration files and performed one explicitly
  authorised restart. HA 2026.10.1 loaded cleanly; revision **125**, the complete
  saved model (including the running one-off), all **43 entities**, **34 controls**,
  user customisations and dashboard resources were preserved. All **50 alias
  reads** passed, served frontend matched the build, and scheduler errors were
  zero. No physical-device test or direct storage edit was performed.

## One-off partial-interval and timeline follow-up (2026-10-23)

- Read-only inspection explained the reported retained band: 21:05–21:15 was
  saved at 21:11:29 and the initial full-interval rule selected the following day.
  The user approved immediate Start when saving inside an eligible interval.
- Implemented immediate partial execution and durable recovery of previously
  waiting partial intervals. Elapsed recovery sends final Stop only, without
  replaying Start. Saving after Stop still waits for the next selected day;
  creation under a disabled/Away gate does not invent a partial resume.
- Replaced visible timeline One-off labels/details with red band and marker
  outlines, including read-only previews. Popup status/details remain available.
- **24 focused backend tests** passed; five focused Chromium cases passed
  (four on the first pass, the preview case after fixing CSS specificity).
  Production build and Ruff lint passed. Broad suites were not repeated.
- Deployed the two changed integration files after explicit permission and one
  restart. HA 2026.10.1 loaded cleanly at revision **120**, with all **43 entities**
  and **34 controls** preserved and no scheduler errors. Served bundle matched.
  The reported waiting band was already absent at deployment preflight; no
  production one-off or physical-device test was created to replace it.

## Local one-off time-band development (2026-10-23)

- All **203 backend tests across 11 suites** passed on HA **2026.7.0**,
  **2026.8.1**, **2026.9.4** and **2026.10.1**, using isolated network-disabled
  containers and mocked devices. This includes 21 dedicated one-off cases and
  native-switch exclusion/reload coverage.
- Covered shared weekdays, after-Start creation, exact boundaries, partial and
  long downtime, failed Start/Stop, multi-entity acknowledgement, stale drafts,
  immutable type, parent/sub-schedule/Away interruption, frozen actions,
  persistence/deletion failures, supersession, solar changes, DST and midnight.
  True overnight definitions remain rejected.
- Combined line/branch coverage on HA 2026.8.1: **96.53%**, retaining the existing
  95.1% gate. Frontend production build and **26 unit tests** passed.
- **81 Chromium tests passed**, including four new one-off popup, frozen editor,
  deletion/conflict and failed-save cases; the four focused cases passed again
  after final frontend adjustments.
- Ruff lint, gradual mypy and official hassfest passed (one valid integration,
  zero invalid).
- Deployed seven targeted integration files locally after explicit restart
  authorisation, with exactly one production restart. HA **2026.10.1** loaded
  successfully. Saved model/revision **117**, all **43 native entities**, their
  identities/customisations, **34 existing controls**, and Lovelace resources
  were preserved. All **50 alias reads** passed; served assets matched the
  installed build. No scheduler storage/device/log errors were reported.
  Verification used read-only production checks; no physical-device tests,
  deployment backups, direct storage edits, commits or publication occurred.
- Functional behaviour and delivery limitations are documented in
  `docs/ONE_OFF_BANDS.md`.

## Local development phase after 1.11.0: sub-schedule controls (2026-10-23)

- **181 backend tests across 10 suites passed** in isolated, network-disabled
  containers on HA **2026.7.0**, **2026.8.1** and **2026.10.1**. Combined
  line/branch coverage on 2026.8.1: **96.23%** (existing 95.1% gate retained).
- **16 focused sub-schedule cases** cover permanent/timed gates, active/inactive
  re-enable, parent/band independence, Away inclusion/exclusion, offline expiry,
  restart idempotence, stale callbacks/revision conflicts, failed persistence,
  metadata-only edits, overlapping schedules/solar bands, midnight and both UK
  DST boundaries. Equivalent ISO timestamps retain an unchanged expired deadline.
- Real HA lifecycle checks verify legacy UUID entity-registry migration with
  unchanged entity IDs and user names/icons, native sub-schedule switch semantics,
  rename/time-edit identity, reload, orphan cleanup and sub-schedule deletion.
  Native child registration also passed on **2026.9.4**; 2026.7/2026.8 flat-device
  fallback and 2026.10 native-child behaviour passed the full lifecycle suites.
- Old On/Off, new Start/Stop and immutable UUID paths are covered for reads and
  writes; administrator restrictions and entity-read filtering cover all levels.
- Frontend production build and **24 unit tests passed**. **75 Chromium browser
  tests passed**, including modal operation, draft isolation, Apply/Save/Cancel,
  disabled-day black/white/red styling in edit/view mode, refresh and timed expiry.
  An initial browser failure exposed a view-mode CSS cascade issue, now fixed.
- Ruff lint, repository-selected formatting, gradual mypy and official hassfest
  passed (one valid integration, zero invalid). Device-free HA configuration
  validation passed on **2026.7.0** and **2026.10.1**. The existing production
  configuration also returned `valid` through HA's supported check-config API.
- Packaging passed: deterministic ZIP bytes on repeated builds, CRC checks,
  safe relative paths, byte-identical bundled card and exclusion of HA storage
  and Python caches. ZIPs were built in disposable container tmpfs; published
  artifacts were not overwritten. `git diff --check` passed.
- Read-only production preflight found **8 schedules, 10 sub-schedules, 16 bands,
  24 existing Disabled controls and 33 native integration entities**, loaded without
  scheduler storage/device errors. In-memory validation with the candidate code
  preserved the production model exactly. The candidate adds exactly 10 switches
  (one per sub-schedule), for 34 Disabled controls, grouped into 18 devices.
- Installed source matched the repository baseline except three version-label
  files still declaring 1.10.0. The running frontend resource matched the installed
  bundle. This agrees with the earlier pre-release-label deployment noted below.
- **Deployed locally following explicit restart authorisation:** installed 13
  changed integration files and performed one restart of `homeassistant`.
  HA **2026.10.1** returned to `RUNNING`, with the integration `loaded`.
  All **8 schedules, 10 sub-schedules and 16 bands** remained identical at revision
  **111**. All **33 existing entity identities and user customisations** were
  preserved; there are now **43 native entities**, including **34 Disabled
  controls**, grouped into **8 schedule devices and 10 native child devices**.
  Every band switch belongs to its corresponding sub-schedule child device.
  All **50 read-only immutable/legacy-path checks** passed, native switch states
  and attributes matched the API, and served card/loader bytes matched the build.
  The frontend module was registered, user Lovelace resources were unchanged,
  pending application was false, and no scheduler storage/device or log errors
  were reported on initial and follow-up checks. Verification did not toggle
  physical devices. No backups, direct HA storage edits, GitHub publication or
  commits were made.
- Existing daily-band semantics are preserved: a fixed band cannot wrap midnight;
  overnight schedules use adjacent daily bands. Persisted `end_*` and WebSocket
  `end` values remain compatible while display labels use Start/Stop.

## Integration/card 1.11.0: programmatic schedule and band controls

- All **nine backend suites** passed on isolated HA **2026.8.1** and **2026.10.1**.
  Combined line/branch coverage on 2026.8.1: **96.33%**. Ruff, changed-module
  formatting, gradual mypy and official hassfest passed.
- **12 path/control cases** cover exact paths, normalization and collisions,
  solar/unnamed fallbacks, parent-effective versus own disabled flags, unchanged
  band preferences across parent toggles, deadline cancellation, active starts,
  idempotence, invalid paths/values, renamed paths, persistence failure and boolean
  action responses.
- **Four real HA lifecycle cases** verify native switch/action operation,
  permissions and filtered reads, entity identity through rename/time edits,
  registry cleanup on deletion, reload behaviour and exclusion of manager-owned
  controls from writable scheduling targets.
- Tests use temporary configurations, mocked devices and network-disabled
  containers. No physical devices were used to verify write behaviour.
- Local deployment on HA **2026.10.1** passed configuration validation and startup
  checks. The saved scheduler model was unchanged, native Disabled switches
  matched the boolean path API, and no scheduler storage/device errors were
  reported. Production verification used reads rather than toggling real devices.
- The same runtime behaviour was deployed locally before release version labels
  were applied. Release checks and the supported HA-version matrix run through
  the repository's GitHub Actions workflow.
- Release-version checks passed: production frontend build, **23 unit tests**,
  **72 Chromium browser tests**, path/control tests, native control/action and
  HACS-only installation regressions, Ruff, formatting, gradual mypy and official
  hassfest (one valid integration, zero invalid).

## Integration/card 1.10.0: individual band controls

- Frontend production build, **23 unit tests** and **72 Chromium browser tests**
  passed. Band status now uses the dropdown, Apply and Save, with no separate
  Enable button. The band popup has shorter help text and no timezone label.
- All **eight backend suites** passed on isolated HA **2026.8.1** and
  **2026.10.1**, including **33 focused band cases**. Combined line/branch
  coverage on 2026.8.1: **96.33%**.
- Save-time tests verify active-only resumption with the newly saved settings,
  inactive bands, schedule/Away gates, state actions, storage-failure atomicity,
  exact start/expiry boundaries, and no duplicate start after processed expiry.
  Browser cases verify no writes before Save, Cancel, failed/stale Save retention,
  combined time/status edits and absence of the removed button/timezone text.
- Verification uses isolated HA configurations and mocked devices, plus a
  synthetic browser dashboard. Physical devices were not exercised.
- Release-version checks passed: Ruff, configured formatting, gradual mypy,
  official hassfest (one valid integration, zero invalid), and the HACS-only
  bundled-card serving/lifecycle regression. All 47 manual-install ZIP entries
  matched the reviewed source files, with the versioned 1.10.0 loader included.
- Additional band cases cover permanent/timed disable persistence, inactive and
  unassigned weekdays, solar/DST handling, independent schedule/Away gates,
  downtime coalescing and durable delivery. Older schedules default to enabled
  bands without changing storage/schema version 1.
- The same scheduling/UI behaviour was installed in the maintainer's HA
  **2026.10.1** instance before release version labels were applied. Configuration
  validation passed, the integration loaded after restart, the saved model was
  unchanged and the served card matched the tested build. Deployment verification
  did not exercise manual physical-device actions or inspect a live dashboard.

## Card-picker startup fix · backend 1.9.4 / card 1.9.19

- Reproduced the reported missing custom element with HA frontend **20260930.3**:
  its scoped-registry bootstrap replaces the registry after an early card import.
  The card-picker metadata survived but the element definition did not.
- A small loader now waits for `home-assistant` before importing the card and Lit.
  This ensures registration happens in HA's final custom-element registry.
- Production build, **20 unit tests**, **66 browser tests**, targeted frontend
  backend/lifecycle checks, Ruff, formatting, gradual mypy and hassfest passed.
  The new browser regression verifies that the bundle is not requested before
  HA's frontend is defined and becomes available afterwards.

## HACS single-download packaging · backend 1.9.3 / card 1.9.18

- All **seven backend suites** passed on isolated HA **2026.8.1**, with
  **96.11% combined line/branch coverage** and **100%** for the new frontend
  registration module. Ruff, changed-module formatting and gradual mypy passed.
- Production frontend build, **20 unit tests** and **65 browser tests** passed.
  The new browser regression loads the bundle through two URLs and checks
  custom-element stability, the legacy alias and a single card-picker entry.
- The integration-only install test serves the actual bundled JavaScript over
  HTTP without `/config/www` or manual resource configuration. It verifies the
  route alias, unload/reload, deletion, preserved Away state and retention of
  unrelated frontend modules. A real YAML-dashboard test verifies its resources
  are unchanged. Registration/removal is tested for idempotence.
- Official hassfest: **one valid integration, zero invalid**.
- The complete application, icon and notices are inside the integration
  directory. CI checks that rebuilding does not change the committed payload.
- After the maintainer made the repository public, **HACS repository validation
  passed** in [the first public validation run](https://github.com/flatsheep/scheduling-manager/actions/runs/39483958924/job/118839451544).
  Actual end-user HACS download and card-picker installation remain an
  acceptance check; repository validation is not a claim of a live deployment
  or inclusion in HACS's default catalogue.

## GitHub preparation · backend 1.9.2 / card 1.9.17

- All six backend suites passed on the isolated `hsm-dev:2026.8.1` image;
  combined line/branch coverage **96.06%**. Ruff and gradual mypy passed.
- Frontend production build, **20 unit tests** and **64 Chromium browser tests**
  passed. Browser data is synthetic and never contacts HA.
- Official hassfest: **one valid integration, zero invalid**.
- The reviewed repository export excludes local installation records, artifact
  images/JSON, backups, caches, crash dumps and HA configuration/history.
- These are local results. The complete HA version matrix and GitHub Actions
  results must be checked separately; no HACS acceptance is claimed.

## Current: backend 1.9.2 / card 1.9.14 · responsive Enable/Disable

Compact verification: **nine focused backend cases**, **one focused Enable/Disable browser test**, production build, Ruff, changed formatter check and gradual mypy passed. New cases verify already-setback no-op toggles, active target application, changed-target setback, durable response before slow delivery and restart preservation. Full matrices/coverage were not rerun.

## Current: integration/card 1.9.1 · Away suspension and responsiveness

Compact verification only: **seven focused timed-Away/suspension tests**, **three focused browser tests**, production build, Ruff and gradual mypy passed. Cases cover no repeated setbacks during Away, already-setback skipping, inactive exit without historical target restoration, active-only target resume, expired restart catch-up, atomic failure, deferred response after persistence/before slow devices, popup feedback and date/time handling. Full matrices/coverage were not rerun at the user's request.

## Previous: persistent timed Away

## Integration/card 1.9.0 · persistent timed Away

At the user's request, verification was kept compact: production build, **three focused browser tests**, **five focused timed-Away backend tests** and **two existing Away regression checks** passed. Backend cases cover restart before/after expiry, late normal climate/state catch-up, timer rescheduling without actions/history reset, manual cancellation, storage-failure atomicity/backoff, future-date validation, HA timezone/DST interpretation and revision conflicts. Browser cases cover Cancel without writes, indefinite Away, immediate off, date/time in a different phone timezone, saved return display/reload and draft retention.

Ruff, changed-module formatter checks and gradual mypy pass. Full browser/backend matrices and coverage were **not rerun** for 1.9.0; historical full-suite results below apply to the versions named. No live Away/device actions were used as tests.

## Historical verification

## Current: integration/card 1.8.0 · organization and filters

- **100 backend tests** pass on HA **2026.7.0**, **2026.8.1** and **2026.9.4**. Combined coverage: **96.80%**, including **100%** of the new location presentation module. Registry lookup tests use representative records; registry notification and activity tests run against isolated HA instances.
- **20 frontend unit tests**, **58 browser tests** and production build pass. New coverage exercises combined category/Area/Floor/activity filters, same-entity Area/Floor matching, empty group removal, stored-order grouping, active counts and tint, header/keyboard/Hide all/Show all toggles, shared-time geometry, draft retention and six-entry scrolling with desktop/phone controls, keyboard and emulated touch.
- Backend tests cover entity override/device inheritance, missing metadata, read-permission filtering, registry-only notification without revision/runtime mutation, Away exclusions, enabled-but-outside-band status, DST folds and collapsed solar bands. Previewing does not affect running counts.
- Ruff, gradual mypy (15 integration modules), formatter checks and official hassfest passed. Source metadata is read-only; mock interaction tests perform no real device actions.

## Historical: standards alignment

## Integration/card 1.7.0 · HA standards alignment

- **96 backend tests passed** on HA **2026.7.0**, exact running **2026.8.1** image and **2026.9.4**, using the checked isolated runner (`tools/check_backend.py`).
- Combined statement/branch coverage on the 2026.8.1 dev image: **96.74%**; statement coverage **97.47%**, branch coverage **94.35%**. Every integration module exceeds 95% combined coverage; config flow, lifecycle, runtime lookup, diagnostics and WebSocket API each measure **100%**. CI enforces a 95.1% combined minimum.
- **18 unit tests / 53 browser tests / production build passed** for frontend 1.7.0, whose scheduling/editor behaviour is unchanged.
- Official **hassfest: 1 valid integration, 0 invalid**. Ruff correctness lint passes; formatter checks pass for six modernized lifecycle/API modules. Gradual mypy checking passes for **14 integration source files**. This is not a strict-typing or official quality-tier claim.
- Added real-HA coverage for typed runtime ownership, no-poll translated entity naming, permanent Repairs failures versus transient retries, setup cancellation/platform rollback, refused unloading, recursive diagnostics redaction, unloaded API handling, permission-aware API handlers, subscriptions across reload and translated Away service exceptions. Completed switch actions publish their committed entity state before returning.
- Test cleanup and process isolation address the native `orjson.Fragment`/CPython 3.14 fixture-finalization fault identified with a debugger. No assertion, failed exit or segfault is bypassed; all 96 cases run. Production HA libraries were not changed. Details and remaining publication work are in [HA_STANDARDS.md](HA_STANDARDS.md).

The GitHub workflow is supplied for future publication; no remote CI execution is claimed without a repository remote.

## Previous: review remediation

## Integration 1.6.4 / card 1.6.25 · 7 October 2026

| Suite | Result |
|---|---|
| Backend, exact live HA 2026.8.1 image, isolated/no network | **84 passed** |
| Backend, HA 2026.7.0 | **84 passed** |
| Backend, HA 2026.9.4 | **84 passed** |
| Frontend unit tests | **18 passed** |
| Full Chromium browser suite, current built module | **53 passed** |
| TypeScript check / production build | Passed |
| Five additional isolated audit probes that reproduced review findings | **5 passed** after fixes |

New coverage verifies metadata-only sub-schedule naming preserves pending commands/Away restoration; unrelated overdue events survive atomic Save/delete cutovers; exact-boundary/shared-entity order is retained; name validation/trim/removal; direct dispatch capability lookups; durable cache pruning; notification coalescing; unavailable states with missing attributes preserve pending work; and automatic registry renames update the entity index/cache.

Browser coverage now targets the current five-minute hour/minute selectors, cog, Away included/excluded labels, section Delete placement, all-day badges and mixed fixed/solar dragging. Added tests cover optional-name Save/Cancel/clear, linked-day highlights, chooser pause/revert, background/current-day dismissal, long-name dropdown bounds at 320/390/1600px, no preview reflow (including named No Schedule), defensive malformed-name rendering and zero redraws for unrelated HA updates.

The reproducible synthetic benchmark is `tools/benchmark_scheduler.py`. With 1,301 synthetic HA states, simultaneous mock dispatch with memory-backed storage measured **2.3 / 48.9 / 915.6 ms** for 2 / 20 / 100 scheduled entities, versus review baselines of about **28 / 255 / 1,950 ms**. Dispatch performed **zero full-HA scans**, using 4 / 40 / 200 direct entity reads. Durable acknowledgements intentionally remain N+1 writes per N-command batch to preserve crash behaviour. Disk timings remained highly variable, including an approximately 18-second outlier; these are temporary-container filesystem timings, not production device latency.

All behaviour tests used mock devices. Live verification was read-only; no schedule/Away/Enable controls were exercised.

## Historical verification records

Card **1.6.6** updates fixed-band drag/keyboard limits to use resolved solar neighbours and inward five-minute snapping. Build, **18 unit tests** and **5 targeted browser tests** passed, covering both solar boundaries, unchanged solar markers, ordinary drag/keyboard limits and solar drag lock. Full browser results below apply to 1.6.5; backend is unchanged.

Scheduling Manager integration **1.6.3** / card **1.6.5**, tested on **7 October 2026**. Card updates are frontend-only; backend results remain applicable.

| Suite | Runtime | Result |
|---|---|---|
| Python validation, events, runtime and integration lifecycle | Home Assistant **2026.7.0**, official release image | **75 tests passed** |
| Same Python suite before live update | Home Assistant **2026.8.1**, exact running instance image in an isolated container | **75 tests passed** |
| Same Python suite | Home Assistant **2026.9.4**, official release image (current stable at implementation start) | **75 tests passed** |
| Frontend draft/time/category/dynamic validation | Vitest **4.1.11**, Node **20.19.4** | **17 tests passed** |
| Built module browser interactions | Playwright **1.56.0**, Chromium **141.0.7390.37** | **46 tests passed** |
| TypeScript check and production module build | TypeScript **5.9.3**, esbuild **0.25.11** | Passed |

## What was verified

- Backend decimal increments 0.1 / 0.5 / 1, limits, finite values, explicit units and unit conversion; unsupported range-only flags; cached unavailable capabilities.
- Nonempty section names/entities/days/bands, shared/set-per-section settings, disjoint weekdays, seven sub-schedules, ten bands, adjacent endpoints and cross-section overlaps.
- Pure DST compilation for Europe/London spring gaps/autumn folds and Asia/Kolkata (no DST); midnight origin-date keys and explicit end-before-start comparator; bounded long-downtime compilation.
- Last command wins between sections; temperature-only action payloads; manual targets persist until next event; repeated scheduler values still issue commands.
- No synthetic midnight command; real 1440 endpoints fire; Save inside a band does not replay a start; exact commit-boundary events run only when unprocessed.
- Dispatch delays that cross a subsequent endpoint rearm overdue work immediately instead of losing that boundary.
- Atomic pre-commit storage failure, optimistic revision rejection and queued stale-generation callback invalidation after deletion.
- Away idempotence, logical history, restart/exit, immediate setback for newly saved entities; unavailable newest-pending recovery without blocking healthy entities; manual changes/removal cancel pending failures.
- Restart preserves manual state with no missed endpoint; missed events coalesce; two successive restarts after unsupported HVAC-mode changes still load; removal can clean unsupported unused settings.
- Registry identity renames; timezone changes establish a cutover without commands; configured °C→°F changes convert safely.
- **Real HA config-entry loading**, platform forwarding, switch setup/turn-on/admin permission checks, WebSocket registration and unload; config-flow creation and single-instance abort.
- **Real HA ClimateEntity/service helper** with a mock thermostat verifies the actual service API and native/service-unit conversions.
- **Real HA Store** persists/reloads Away and rejects malformed JSON/envelopes without replacing/renaming the original.
- Frontend new section remains unsaved/incomplete without writes; draft isolation, retained storage-failure/conflict drafts, Cancel and pending whole-section deletion.
- Actual browser hold, movement cancellation, double-click Yes/No deletion, exact midnight editing, keyboard adjustment, pointer dragging clamps, short-gap explicit duration form, numbered popup and owned/released weekdays.
- Chromium touch-scrolling emulation does not create/drag/delete a band; desktop 1600px and phone 390px screenshots; phone has no page-wide overflow.
- Away preserves the draft and global view state; read-only controls are disabled. Backend independently checks permissions.
- Persistent enable/disable: immediate setbacks on disable, per-entity active targets or setback on enable, disabled event suppression, stale callback cancellation, idempotence, restart, No Schedule enable, failed pending replacement, last-command-wins and Away precedence/exit.
- Enable flag defaults to true for legacy sections and rejects non-booleans. Section Save cannot bypass immediate toggle semantics; storage failures/revision conflicts leave the saved enable flag unchanged.
- Theme-colour inheritance, centred text in the rounded day box, larger entity names, Cancel/Save ordering, removal of explanatory/draft/“now” text, icon-only burger buttons, rounded current-time boxes, 90-degree labels and touch/keyboard interaction with narrow markers. Light and dark mocked-theme screenshots are captured.
- Resize regression checks at 390, 900, 1100, 1600 and 2400px: SVG scales remain 1:1, marker/time-label/box dimensions remain constant, and long-hold hit testing still creates the correct five-minute-snapped band on an extra-wide canvas.
- Real HA light/select/number entity service helpers are exercised with mocked devices. Official setter schemas are validated for date/time/datetime, input helpers, fan, valve, water heater and timer.
- Mixed climate/state sections, inverted ON/OFF endpoints, independent state pairs across sections, feature-filtered actions and enum/range/text/date-time validation. Sensor/read-only entities and the manager's own control are excluded.
- Non-climate Disable and inactive Enable leave state unchanged; Away inclusion is persisted on section Save. Included states suspend without commands and resume active start-states only; excluded sections continue climate and state transitions. Climate pending recovery remains intact in mixed sections.
- Late Disable/Away entry do not replay non-climate missed starts. New state memberships during Away stay unchanged; unavailable state recovery, option/service registration changes and manual-failure cancellation use only current pending work. Invalid unmanaged metadata cannot block healthy entities.
- Numeric unit changes never reinterpret saved state values. Non-finite current suggestions cannot poison storage. Groups use real group-expanding actions; code-protected alarm choices are filtered rather than inventing credentials.
- The heading derives from the raw containing view Title, ignoring card-level titles and generated fallbacks. Untitled views remain blank. State, numeric, text and HA-timezone date/time editors are covered, including spaces and empty text.
- Enlarged orange time labels remain unscaled at 16px in 64×30px rounded boxes; current-time lines are 3.5px thick.
- Mouse and touch overlap cycling promotes the selected marker above others, including view mode; repeated quick taps neither open an unintended editor nor delete a band. Exact-time and deletion controls remain accessible in edit mode, with unchanged gesture/drag/keyboard behaviour.
- Entity rows use orange start/target on the left and blue end/setback on the right, without modifying saved values.
- Category creation/reuse, cancelled assignments, automatic removal of unused names, canonical persistence, invalid payloads, storage failure and optimistic revision conflicts. Category-only commits retain Away history and runtime progress and emit no device action.
- Category filtering/sorting uses copies and keeps persisted execution order intact. Editor retention, light-grey watermark layering, non-intercepting labels, header position and phone layouts are verified.
- Multi-category checkbox selection including Unassigned, Select all/mixed state, clear all, cancelled temporary selections, green applied-filter indication and normal colour after removing the filter. Sorting alone stays unfiltered, with no backend mutations.
- Compact 16px entity names and an inline three-button edit action row at 1600, 390 and 320px widths, without page-wide overflow.
- View badges show current grouped days in light green, other assigned days in grey, and omit unassigned days. Colours switch across midnight; edit mode retains the ordinary selected-day green and sub-schedule 1 default.
- A single current-time box/line spans all strips, with synchronized horizontal scrolling, constant geometry and responsive visibility. Per-row time indicators are absent in the card.
- A red quick-clear button appears left of Filter/Sort only while filtering; clearing retains sort selection and produces no backend mutation.
- Monitor-touchscreen hold/drag tests confirm context-menu cancellation, stable drag capture, five-minute snapping and unchanged saved configuration. Physical OS/browser hardware combinations are not claimed as separately tested.
- Preferred Scheduling Manager card registration and the legacy tag alias both exist; integration/switch registration retains existing storage/domain/entity identities under the renamed display brand.
- Reference-layout test verifies the theme-derived panel is lighter than the source colour, a 354px desktop panel precedes the timeline, six entities form three paired rows, and the day/title are aligned in one toolbar row. Mock desktop/phone screenshots and phone overflow checks pass. Existing gesture, touchscreen, transaction, filtering and shared-line tests pass with the new two-part layout.
- Edit-reference layout verifies top section trash, per-membership inline SVG trash icons, paired rows, footer action/category/Cancel/Save positions, phone overflow, confirmation No/Yes and Cancel restoration of removed memberships without backend writes.
- Native sub-schedule dropdown selection preserves owned-day and deletion-release behaviour. Blank double-click adds an exact one-hour pair without a popup; overlapping/short/out-of-day gaps are refused without creating invalid data.
- Compact 300px band dialog, side-by-side time fields, lower-right SVG trash, help/footer spacing, No retaining the editor, Yes removing only unsaved content, and Add time band clearance above the lower rule are verified.
- Inactive-day ghost previews preserve the active timeline and saved model, issue zero API writes, retain grey badges with blue borders, and dismiss on outside interaction or 10 seconds of inactivity. Pointer interaction resets the timeout; switching days, toggle-off, Escape and entering edit mode are verified. Touch preview on a No Schedule day preserves that status without activation. The timeout boundary test pauses the browser clock before interaction for deterministic timing. Screenshot: `artifacts/ghost-sub-schedule-preview.png`.

- Preview emphasis checks verify full-strength dotted overlays rendered after the active schedule, dimmed active markers/connectors at 25% opacity, restored opacity on dismissal, and very light grey No Schedule text during touch preview. Screenshot: `artifacts/no-schedule-preview-phone.png`.
- No Schedule preview regression verifies that the label's full bounding box and font size stay identical before and during preview; only its colour changes. The production build and all 37 browser tests passed for card 1.5.2.
- Dynamic endpoints: authoritative event/offset validation, day-varying solar recurrences, minute-exact signed offsets, day clipping, pair crossing/collapse with end-only dispatch, missing-event suppression and active-band checks. Real HA solar helpers verify all six events, configured location/timezone changes, DST dates and polar missing sunrise. Mocked runtime tests cover Save without replay, actual dynamic transitions, restart persistence and immediate Enable/Disable resolution.
- Native fixed-time inputs retain exact end-of-day editing. Desktop/touch popup tests verify checkbox visibility, six-event dropdowns, zero/default offsets, popup Cancel isolation, section Save persistence, dynamic ` *` labels, collapsed marker positions, disabled direct adjustment, restoration of fixed times, weekday-specific preview resolution, editable missing-event labels and double-click-create followed by popup configuration. Native platform picker internals are browser/OS supplied; emulated touch is not a physical-device picker test. Screenshots: `artifacts/dynamic-time-band-popup.png`, `artifacts/dynamic-time-band-phone.png`.

- Popup refinement tests verify event dropdown position/width matches the fixed-time picker, resolved-time previews respond to event, offset and paired fixed-time changes, clamp results match the timeline, and the calculation date is visible. Drag attempts on both the solar endpoint and its paired fixed endpoint leave dynamic-band definitions and marker positions unchanged and send no API writes. Screenshot: `artifacts/dynamic-time-band-preview-popup.png`.
- Offset prediction regression: the main output follows event plus offset even when the actual band endpoint must be adjusted. A separate Band time reports that adjustment, and previous/next-day labels cover offset results across midnight. Browser Apply verifies that the timeline uses the same adjusted time as the popup.
- Start-anchor crossing regression: frontend/backend keep resolved Start and move End to match it, including two dynamic endpoints and a dynamic Start with fixed End. Popup End Band time and End matches start appear immediately, while predictions retain event-plus-offset values. Apply renders both markers at Start. End-only dispatch is verified at the new common instant, including next-day midnight; runtime tests confirm no earlier end action.
- Native End field regression: the input's value and minimum follow resolved Start immediately; repeated earlier selections are clamped even when the rendered binding value is unchanged. Later End choices remain available. Off-grid solar minutes remain exact in both input and timeline after Apply, using a valid fixed anchor internally. Fixed-only inputs preserve their five-minute minimum duration and Apply agrees with the displayed value. The two End-field regressions were re-run after final minimum-duration normalization. Screenshot: `artifacts/popup-end-time-limited.png`.

All backend test containers ran with `--network none`, a **read-only project mount**, and temporary configurations. Climate entities/actions were mocked. Browser test API and states were mocked. The automated suites did not deploy to or contact a live HA instance, and no real thermostat action was performed. Private installation records are not part of the repository.

## API verification references

Release-source verification used HA 2026.7.0's `ClimateEntity`, climate constants and service handler, `helpers.temperature.display_temp`, `helpers.storage.Store`, `helpers.event.async_track_point_in_utc_time`, `helpers.entity_registry.EntityRegistry.async_get`, config-entry platform lifecycle, switch service contexts and authenticated WebSocket registration/permissions. The same executable integration tests pass on 2026.9.4. Current stable was identified through the official GitHub releases API.

## Boundaries and limitations

- **Range-only climate devices are unsupported** by design. The manager only changes single target temperature, never mode or presets.
- No-step fallback uses HA's default display precision (0.1°C/1°F). It cannot infer undocumented physical device increments. Device refusal is surfaced as a per-entity error. Converted temperatures that miss the advertised step grid require explicit user correction.
- **No periodic retry loop**: failed work waits for a newer transition, availability recovery, or startup recovery. This avoids repeatedly overwriting manual control. All dispatch is serial; a slow service can delay other commands by up to its 20-second timeout.
- Exactly-once thermostat delivery cannot be guaranteed across a crash between service success and durable acknowledgement. Recovery may repeat the final desired command once.
- Version 1 intentionally uses a **global revision**; an unrelated section Save, Enable/Disable action or Away toggle can conflict with unsaved edits. There is no automatic merge/rebase.
- Phone timelines intentionally scroll horizontally; exact-time forms provide practical five-minute editing. Browser tests emulate touch and screen sizes, **not physical iOS/Android devices**. Styling and captured screenshots cover mocked light and dark themes; the installed dashboard is also checked against its actual HA theme.
- Automated tests cover the listed core scenarios; they are not a claim that every sentence of the full specification was individually tested. No long-running hardware soak test or future-release compatibility claim is made.
- Store/schema version 1 (HA envelope 1.1) remains in use. Optional `enabled` and `away_enabled` flags default to true for existing sections. Climate data/runtime progress are preserved; non-climate memberships add state pairs and numeric units. Unknown schema/envelope versions refuse setup and preserve the original.
- Writable-domain support is explicit and based on real advertised actions (see README table). Unknown custom setters, stateless-only entities, read-only groups and manager controls are not offered. Device output/state achievement is not guaranteed by action acceptance.
- Frontend is manually registered under `/local/`; there is no HACS approval, auto-resource injection or bundled static HTTP endpoint.

See README for reproducible commands and the installation procedure. Browser tests generate local screenshots in `artifacts/` using mocked climate entities. Screenshots are not included in the repository export.
