# HACS publication preparation

## Single-download package

- `manifest.json` classifies Scheduling Manager as a `service`, so its config
  entry is managed in HA's normal Integrations grid, independently of its entities.
- `hacs.json` supplies the display name and existing HA 2026.7.0 minimum.
- One integration lives under `custom_components/heating_schedule_manager/`.
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
- The card registers itself in the card picker. Existing card type aliases are
  retained; duplicate module loads do not redefine custom elements. Older
  manual installations should remove their obsolete `/local/` scheduler
  resource to avoid loading different old/new versions together.
- The build verifies the card version against the Python frontend registration
  and copies the bundle/notices into the integration. CI rebuilds the frontend
  and checks that the committed HACS payload is up to date.
- Removal and saved-data retention are documented in `README.md` and
  `HA_STANDARDS.md`. Unloading stops the runtime; deleting the config entry does
  not purge saved schedules or restore device targets.

## Validation and public release

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
5. Publish the first release as **v1.9.19**, containing integration **1.9.4** and
   card **1.9.19**. HACS can download the default branch before releases exist.
   The generated ZIP is a manual-install fallback, not a HACS `zip_release`.
6. Submit for the HACS default catalogue separately if desired. A public custom
   repository does not need default-catalogue inclusion to be downloaded.

References:
- https://www.hacs.xyz/docs/publish/start/
- https://www.hacs.xyz/docs/publish/integration/

The initial GitHub upload is preparation, not a HACS listing or a published
release. Check the repository's Releases and Actions pages for current status.
