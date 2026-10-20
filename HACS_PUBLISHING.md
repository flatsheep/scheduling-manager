# HACS publication preparation

## Prepared locally

- `manifest.json` classifies Scheduling Manager as a `service`, so its config
  entry is managed in HA's normal Integrations grid, independently of its entities.
- `hacs.json` supplies the display name and existing HA 2026.7.0 minimum.
- The project already has one integration under
  `custom_components/heating_schedule_manager/`, UI setup, unload support and
  persisted schedules. Keep this domain to preserve existing installations.
- Removal and saved-data retention are documented in `README.md` and
  `HA_STANDARDS.md`. Unloading stops the runtime; deleting the config entry does
  not purge saved schedules or restore device targets.

## Before publishing

1. Use the **contents of `scheduling_manager/`** as the repository root, so HACS
   can find `custom_components/` and `hacs.json`. Review the public file set;
   local installation records, private backups, HA data and development artifacts
   are not release content.
2. The manifest now identifies `@flatsheep` and the documentation/issues URLs
   for `flatsheep/scheduling-manager`. Keep the preparation repository private
   until ready; HACS distribution requires it to be public.
3. GPL-3.0 licensing and third-party notices are included. Add project brand
   assets and verify the GitHub description/topics before public distribution.
4. Finish companion-card packaging. HACS Integration downloads manage the
   integration directory, not the current ZIP's separate `/config/www/` files.
   For a single-download application, bundle the built card inside the
   integration, serve it through HA and implement resource registration/removal
   that preserves unrelated dashboard resources. Verify upgrades and legacy
   card/resource aliases. Until then, the card requires the documented manual
   installation; `hacs.json` alone does not make that automatic.
5. Run official hassfest and HACS validation against the final repository, plus
   the project's relevant backend/frontend checks. Verify clean installation,
   upgrade from the manual installation, visibility, deletion and re-addition
   on a disposable HA configuration.
6. Build a fresh release package from the amended source and choose consistent
   integration/card/release versions. Existing archives predate this amendment.
   The manual-install ZIP is not configured as a HACS `zip_release` artifact.
7. Publish a versioned GitHub release, then verify installation through HACS as
   a custom repository of type **Integration**. Default-catalogue submission is
   a later, separate step.

References:
- https://www.hacs.xyz/docs/publish/start/
- https://www.hacs.xyz/docs/publish/integration/

The initial GitHub upload is preparation, not a HACS listing or a published
release. Check the repository's Releases and Actions pages for current status.
