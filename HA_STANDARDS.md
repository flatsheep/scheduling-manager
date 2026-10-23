# Home Assistant standards alignment · 1.7.0

Release 1.9.0 adds persistent timed Away with compact targeted verification only
at the user's request. Full-suite coverage figures below are historical; the
coverage checklist item is pending remeasurement for the new feature.

The current 1.8.0 release retains this alignment and adds a typed read-only
presentation module for authorized Area/Floor metadata plus UTC-resolved activity.
Its **100 backend / 20 unit / 58 browser tests** pass, with **96.80%** combined
coverage, 15 mypy-checked modules and seven formatter-checked lifecycle/API modules.

This remains a **custom integration**, not an officially awarded quality tier
or Core-approved integration. The engineering checklist is
`custom_components/scheduling_manager/quality_scale.yaml`.

## Implemented

- **Typed config-entry runtime:** `ScheduleConfigEntry = ConfigEntry[Manager]`.
  Runtime lives in `entry.runtime_data`, not `hass.data[DOMAIN]`. Unload releases
  it; failed/cancelled setup cleans up timers and listeners. APIs resolve only
  initialized, live runtimes.
- **Global API registration:** WebSocket handlers register once in `async_setup`.
  Subscriptions survive entry reload without retaining the previous manager.
  Unloaded reads and mutations return `not_loaded` consistently.
- **Configuration:** config-entry-only `CONFIG_SCHEMA`, UI config flow and
  explicit single-entry manifest policy. Schema/storage version 1 is unchanged.
- **Away entity:** `has_entity_name`, translation key, English translation and
  icon translations; push updates only (`should_poll = False`), explicit parallel
  update limit and storage-aware availability. Existing entity/unique IDs remain.
- **Errors and Repairs:** malformed/unsupported storage is a permanent
  `ConfigEntryError`, with a persistent recovery issue. Temporary storage failures
  use `ConfigEntryNotReady`. Success clears the issue. HA setup/Away service errors
  use translation keys; unexpected failures and cancellation propagate after cleanup.
- **Diagnostics:** recursive HA redaction removes entity/registry IDs, section,
  sub-schedule and category names, state/temperature values and error text from
  every configuration/journal copy. Capability metadata is summarized by count.
  The original in-memory snapshot is not modified.
- **Metadata:** sorted manifest, service type, `calculated` IoT class and
  `single_config_entry`. The service classification makes the application
  discoverable in the normal Integrations grid. Official hassfest was rerun
  after the classification amendment: one integration, zero invalid integrations.
- **Checks:** reproducible dev container, Ruff correctness lint, formatter checks
  for modern lifecycle/API modules, gradual mypy checks for all integration modules,
  measured line/branch coverage with a 95.1% combined gate and mock regression suites.
- **CI:** `.github/workflows/ci.yml` defines offline HA 2026.7.0/2026.8.1/2026.9.4
  checks, pinned official hassfest and frontend build/unit/mock-browser checks.
  Remote CI results must be checked separately in the repository's Actions tab.

The integration domain, API namespace, resource aliases, private storage,
Away ID and saved scheduling behaviour are preserved.

Verified release results: **96 backend tests** on HA 2026.7.0/2026.8.1/2026.9.4;
**96.74% combined line/branch coverage**, every module above 95% combined;
**18 unit / 53 browser tests**; production build, Ruff, gradual mypy and official
hassfest passed. These figures are historical verification results, not a
claim of a current remote CI run.

## Remaining publication/highest-tier work

GitHub code-owner identity, project documentation and issue tracker URLs now
refer to the public `flatsheep/scheduling-manager` repository. HACS repository
validation has passed; end-user installation testing is tracked separately.
An original icon is bundled under the integration's `brand/` directory.
Core review and full strict typing remain outside the current custom release.
See `HACS_PUBLISHING.md` for the HACS packaging/publication prerequisites.

Mypy is gradual because the backend uses validated JSON dictionaries. Formatter
checks cover modernized lifecycle/API modules, not every legacy scheduler/test
module. Editor strings remain English; entity/service/repair text now follows
HA's translation mechanism. No Bronze/Silver/Gold/Platinum claim is made.

## Reproduce locally

Build dependencies separately, then test offline with read-only source and
temporary HA configurations. All device services are mocked.

```bash
docker build -f tools/Dockerfile.dev -t hsm-dev:2026.8.1 .
docker run --rm --network none -v "$PWD:/work:ro" \
  -e RUFF_CACHE_DIR=/tmp/ruff-cache -e COVERAGE_FILE=/tmp/coverage \
  --entrypoint sh hsm-dev:2026.8.1 -c '
    python -m ruff check . &&
    python -m mypy --cache-dir=/tmp/mypy-cache &&
    python tools/check_backend.py --coverage'
docker run --rm --network none -v "$PWD:/github/workspace:ro" \
  ghcr.io/home-assistant/hassfest@sha256:c79061c27ff0b4c43534d9a0ae67b19fe320261be8c0aded32b117e0272237e3
```

Coverage uses the Python tracer (`timid = true`). A native debugger traced the
shutdown fault to an `orjson.Fragment` heap type being released before late
fixture objects during CPython 3.14 finalization. It occurred with both test
runners, two coverage versions, and sometimes without coverage. The fixtures
now unload entries, release state/data caches and references, and collect cycles
while native modules are alive. Each real lifecycle/standards case runs in its
own checked process; the other suites run per module. Every test runs, every
process exit is checked, and all branch data is combined before applying the
threshold. No crash is ignored/retried; production HA dependencies are unchanged.

## Removal and recovery

1. Back up HA if schedules may be needed later.
2. Remove Scheduling Manager through Settings → Devices & services. Unload
   stops its scheduling; it issues no device commands or target restoration.
3. Its automatically registered frontend module is removed on unload. Remove
   its dashboard card if unused, then uninstall through HACS to remove the
   package files (or remove the directory for a manual install). Existing
   manually registered legacy scheduler resources can be removed separately;
   unrelated dashboard resources are never modified by the integration.
4. `.storage/scheduling_manager` is deliberately retained for recovery.
   To purge it permanently, back it up, remove the integration and delete that
   specific file while HA is stopped.

For a corrupt-storage Repairs issue, restore a known-good HA backup and reload
the integration. Deleting the file would discard saved schedules. Successful
setup clears the issue. For temporary storage errors, check disk space and file
permissions; HA retries setup automatically. Failed setup preserves the original.
