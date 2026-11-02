# v2.0.5 — centred one-off icons on iPad

## Fix

The calendar-clock icon above a one-off time band could appear off-centre inside
its red circle in the Home Assistant iPad app. The previous badge placed an HTML
Home Assistant icon inside an SVG `foreignObject`, then applied CSS scaling.
This mixed HTML/SVG rendering is sensitive to browser-specific positioning.

The badge now draws the calendar-clock directly as a native SVG path. The circle
and icon share the same coordinate system, and alignment uses the artwork's
actual bounds rather than the slightly asymmetric 24px icon viewport. This
applies to both active one-off bands and preview bands.

This is a visual frontend fix; schedule execution, saved schedules and device
commands are unchanged. The integration, card and outer/inner loader versions
are all updated to **2.0.5**, so the packaged update requests the new frontend.

## Updating

1. In HACS, open **Scheduling Manager** and update/download **v2.0.5**.
2. Restart Home Assistant to load the integration's new versioned frontend URL.
3. Refresh the dashboard or reopen the Home Assistant app on your iPad.
4. If the old badge persists, open **Settings → Companion App → Debugging →
   Reset frontend cache**, then reopen the dashboard. Menu wording may vary with
   the app version.

For manual installations, use `scheduling-manager-2.0.5.zip`, replace the
`custom_components/scheduling_manager` directory, then follow steps 2–4. Existing
schedules are retained; do not remove/re-add the integration.

## Verification

- Production frontend build and all 26 frontend unit tests pass.
- All 89 browser tests pass, including one-off creation/editing, preview styling
  and artwork alignment for active/preview badges at 768px and 1024px widths.
- Both frontend registration/payload checks and the HACS-only installation test
  pass in an isolated Home Assistant 2026.10.1 container.
- The locally served bundle was checked in the actual Home Assistant frontend
  using Chromium: zero horizontal/vertical artwork offset, with no `foreignObject`.
- Direct iPad/WebKit visual confirmation remains a user-device check; WebKit
  automation is unavailable on the development host.
