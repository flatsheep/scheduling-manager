# HACS publication preparation

## Single-download package

- `manifest.json` classifies Scheduling Manager as a `service`, so its config
  entry is managed in HA's normal Integrations grid, independently of its entities.
- `hacs.json` supplies the display name and existing HA 2026.7.0 minimum.
- One integration lives under `custom_components/scheduling_manager/`.
  Its `www/` directory contains the committed, prebuilt card. License notices
  and the original `brand/icon.png` are inside the integration too, so HACS
  downloads the complete application without needing a second frontend repo.
- The integration serves the bundle through HA's static-path API and registers
  its versioned URL through the supported `frontend.add_extra_js_url` API.
  This works with storage and YAML dashboards, without editing dashboard
  resources or configuration files. Unload removes only its own frontend URL.
- The registered URL is a small loader which waits for `home-assistant` before
  importing Lit/the card, so HA's scoped-registry bootstrap cannot erase the
  card definitions. Loader and bundle URLs both include the card version.
- The card registers itself in the card picker. Only the canonical card type is
  registered; duplicate module loads do not redefine custom elements. Older
  manual installations should remove their obsolete `/local/` scheduler
  resource to avoid loading different old/new versions together.
- The build verifies the card version against the Python frontend registration
  and copies the bundle/notices into the integration. CI rebuilds the frontend
  and checks that the committed HACS payload is up to date.
- Removal and saved-data retention are documented in `README.md` and
  `HA_STANDARDS.md`. Unloading stops the runtime; deleting the config entry does
  not purge saved schedules or restore device targets.

## Validation and public release

Release **v2.0.0** completes the domain rename. It has only the canonical
integration directory; existing 1.x installations use the
[one-time migration](docs/MIGRATION.md). Default-catalogue submission is separate.

1. The repository root already contains `custom_components/` and `hacs.json`.
   The manifest identifies `@flatsheep` and the project's documentation/issues
   URLs. Private installation records, backups and HA data are excluded.
2. Run the backend suites, browser tests, official hassfest and package checks.
   The HACS-only install regression copies just `custom_components/` into a
   temporary HA configuration, requests the real served JavaScript, and verifies
   module registration, reload, removal and persisted schedule data. It needs
   no `/config/www` files or manually registered dashboard resource.
3. The repository is now public, at the maintainer's request. Anonymous access
   returns HTTP 200 and the first public HACS repository-validation job passed:
   https://github.com/flatsheep/scheduling-manager/actions/runs/39483958924/job/118839451544
   HACS validation runs automatically on subsequent pushes.
4. Download through HACS as a custom **Integration** repository. Confirm the real
   end-user card-picker installation and the documented upgrade from a manual
   install. Repository validation is not itself an end-to-end installation test.
5. Release **v2.0.2** contains integration and card **2.0.2**, async-safe timezone
   and solar loading, durable timeout failures, dashboard restart recovery and
   the touch-popup fix. **v2.0.1** grouped activity sensors on schedule devices
   and Away on a manager device. **v2.0.0** introduced
   the canonical domain, resumable 1.x migration and inherited disabled-band styling.
   **v1.12.0** introduced one-off bands and sub-schedule controls. Native
   schedule/band Disabled switches and boolean path actions arrived in **v1.11.0**. Individual band
   controls were introduced in **v1.10.0**. The first public release was
   **v1.9.19** (integration **1.9.4**, card **1.9.19**). The generated ZIP is a
   manual-install fallback, not a HACS `zip_release`.
6. Submit for the HACS default catalogue separately if desired. A public custom
   repository does not need default-catalogue inclusion to be downloaded.

References:
- https://www.hacs.xyz/docs/publish/start/
- https://www.hacs.xyz/docs/publish/integration/

Public releases and HACS custom-repository installation are available. Inclusion
in HACS's default catalogue is a separate submission. Check the repository's
Releases and Actions pages for current status.
