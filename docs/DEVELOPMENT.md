# Development and verification

Sources: `custom_components/scheduling_manager/`, `frontend/src/`, `tests/`.
The Lit card uses HA's authenticated connection. Scheduling runs in Python using
the existing serialized event stream, atomic Store snapshots and desired-command
journal. See [API contracts](../API.md), [HA standards](../HA_STANDARDS.md),
[one-off lifecycle](ONE_OFF_BANDS.md) and [test results](../TEST_RESULTS.md).

## Frontend

Node.js 20.19+ and npm:

```bash
cd frontend
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

The build checks version agreement and copies the bundle to `dist/` and the
integration's `www/` folder, together with license notices. The loader waits for
HA frontend bootstrap. Only `custom:scheduling-manager-card` is registered.
No runtime CDN is required.

Browser tests use a loopback-only mocked dashboard, not a live HA installation.
Generated local screenshots go in ignored `artifacts/`. Maintainer-supplied
documentation screenshots are kept separately in `docs/images/`.

## Backend

Run the existing suites inside real HA release images with isolated temporary
configuration, mocked devices and networking disabled:

```bash
docker run --rm --network none --entrypoint python \
  -v "$PWD:/work:ro" -w /work \
  ghcr.io/home-assistant/home-assistant:2026.10.1 \
  tools/check_backend.py
```

CI checks HA 2026.7.0, 2026.8.1, 2026.9.4 and 2026.10.1, including lifecycle,
coverage, Ruff, selected formatting, mypy, hassfest, HACS and frontend regressions.
`tools/Dockerfile.dev` adds development tools to the selected HA image.
`tools/benchmark_scheduler.py` measures isolated scheduler overhead without
physical devices.

## Packaging

```bash
python3 tools/package.py
```

This produces a deterministic versioned ZIP in `artifacts/`, containing the
integration, bundled card, notices and public documentation. It excludes HA
configuration/storage, caches and local installation records. HACS installs the
integration directory directly; the ZIP is a manual-install fallback.

Keep frontend package/lockfile, Python frontend registration and manifest versions
aligned. Build before committing so the bundled payload matches the sources.
Publish only after reviewing intended changes and checking the release workflow.
HACS default-catalogue submission is separate from normal custom-repository releases.
