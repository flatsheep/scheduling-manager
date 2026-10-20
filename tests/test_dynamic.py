"""Solar recurrence, location/timezone, missing events and crossing semantics."""
from datetime import date, timedelta, timezone
import tempfile
import unittest
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant
from homeassistant.helpers.sun import get_astral_event_date
from custom_components.heating_schedule_manager.dynamic import SolarTimes, resolve_band, SOLAR_EVENTS
from custom_components.heating_schedule_manager.events import compile_events, section_active
from custom_components.heating_schedule_manager.validation import Invalid, validate
from test_backend import fixture, CAP, NOW

UTC = timezone.utc


class DynamicTests(unittest.TestCase):
    def test_validation_accepts_definitions_and_rejects_bad_offsets_events(self):
        section, settings = fixture()
        model = {"revision": 0, "away": False, "entity_settings": settings, "schedules": [section]}
        band = section["sub_schedules"][0]["bands"][0]
        for event in SOLAR_EVENTS:
            band["start_dynamic"] = {"event": event, "offset": -300}
            band["end_dynamic"] = {"event": "sunset", "offset": 300}
            validate(model, {"climate.kitchen": CAP})
        for value in ({"event": "bogus", "offset": 0}, {"event": "sunrise", "offset": 301},
                      {"event": "sunrise", "offset": -301}, {"event": "sunrise", "offset": True},
                      {"event": "sunrise", "offset": 0.5}, {"event": "sunrise"}, "sunrise"):
            band["start_dynamic"] = value
            with self.assertRaises(Invalid):
                validate(model, {"climate.kitchen": CAP})

    def test_daily_events_vary_and_use_offsets_without_five_minute_rounding(self):
        section, _ = fixture(days=[0, 1])
        band = section["sub_schedules"][0]["bands"][0]
        band["start_dynamic"] = {"event": "sunrise", "offset": -17}
        band["end_dynamic"] = {"event": "sunset", "offset": 30}
        solar = lambda day, event: (360 if event == "sunrise" else 1200) + day.day - 6
        events = compile_events({"revision": 1, "schedules": [section]}, "UTC", NOW.replace(hour=0), NOW + timedelta(days=2), solar)
        self.assertEqual([(e.endpoint, e.instant.hour, e.instant.minute) for e in events],
                         [("start", 5, 43), ("end", 20, 30), ("start", 5, 44), ("end", 20, 31)])
        self.assertTrue(section_active(section, "UTC", NOW, solar))
        self.assertFalse(section_active(section, "UTC", NOW.replace(hour=21), solar))

    def test_crossed_dynamic_pair_collapses_and_only_end_fires(self):
        section, _ = fixture(start=720, end=960)
        band = section["sub_schedules"][0]["bands"][0]
        band["start_dynamic"] = {"event": "sunset", "offset": 300}
        solar = lambda day, event: 1200
        self.assertEqual(resolve_band(band, NOW.date(), solar), (1440, 1440))
        model = {"revision": 1, "schedules": [section]}
        events = compile_events(model, "UTC", NOW, NOW + timedelta(days=1), solar)
        self.assertEqual([e.endpoint for e in events], ["end"])
        self.assertEqual(events[0].instant, NOW.replace(hour=0) + timedelta(days=1))
        self.assertFalse(section_active(section, "UTC", NOW.replace(hour=16), solar))
        del band["start_dynamic"]
        band["end_dynamic"] = {"event": "sunrise", "offset": -300}
        self.assertEqual(resolve_band(band, NOW.date(), lambda *args: 360), (720, 720))
        band["start_dynamic"] = {"event": "sunset", "offset": 0}
        self.assertEqual(resolve_band(band, NOW.date(), lambda day, event: 1200 if event == "sunset" else 360), (1200, 1200))

    def test_offset_clips_to_day_and_missing_event_never_uses_fixed_fallback(self):
        section, _ = fixture(start=0, end=1440)
        band = section["sub_schedules"][0]["bands"][0]
        band["start_dynamic"] = {"event": "sunrise", "offset": -300}
        band["end_dynamic"] = {"event": "sunset", "offset": 300}
        solar = lambda day, event: 100 if event == "sunrise" else 1400
        self.assertEqual(resolve_band(band, NOW.date(), solar), (0, 1440))
        missing = lambda *args: None
        self.assertIsNone(resolve_band(band, NOW.date(), missing))
        self.assertEqual(compile_events({"revision": 0, "schedules": [section]}, "UTC", NOW, NOW+timedelta(days=1), missing), [])
        self.assertFalse(section_active(section, "UTC", NOW, missing))


class SolarHelperTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.tmp.name)
        self.hass.config.latitude = 51.5
        self.hass.config.longitude = -0.1
        self.hass.config.time_zone = "Europe/London"

    async def asyncTearDown(self):
        await self.hass.async_block_till_done()
        self.tmp.cleanup()

    async def test_actual_ha_solar_helper_all_events_timezone_and_location_refresh(self):
        solar = SolarTimes(self.hass)
        day = date(2026, 7, 6)
        for event in SOLAR_EVENTS:
            minute = solar(day, event)
            self.assertIsInstance(minute, int)
            self.assertTrue(0 <= minute < 1440)
        expected = get_astral_event_date(self.hass, "sunrise", day).astimezone(ZoneInfo("Europe/London"))
        self.assertEqual(solar(day, "sunrise"), expected.hour*60+expected.minute)
        old = solar(day, "sunrise")
        self.hass.config.longitude = 20
        self.assertNotEqual(solar(day, "sunrise"), old)
        self.hass.config.time_zone = "Asia/Kolkata"
        self.hass.config.latitude = 22.5
        self.hass.config.longitude = 88.3
        for event in SOLAR_EVENTS:
            self.assertIsInstance(solar(day, event), int)

    async def test_polar_missing_sunrise_is_none_not_an_arbitrary_day(self):
        self.hass.config.latitude = 89
        self.assertIsNone(SolarTimes(self.hass)(date(2026, 6, 21), "sunrise"))

    async def test_dst_date_changes_use_ha_location_and_local_calendar(self):
        solar = SolarTimes(self.hass)
        for day in (date(2026, 3, 28), date(2026, 3, 29), date(2026, 10, 25)):
            expected = get_astral_event_date(self.hass, "sunrise", day).astimezone(ZoneInfo("Europe/London"))
            self.assertEqual(solar(day, "sunrise"), expected.hour*60+expected.minute)
