"""Daily solar endpoints from HA's configured location; no entity-state guesses."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from homeassistant.helpers.sun import get_astral_event_date

SOLAR_EVENTS = ("sunrise", "sunset", "dawn", "dusk", "noon", "midnight")


def resolve_band(band, day, solar=None):
    """Clamp to the local day and paired endpoint. Never swap endpoints."""
    values = []
    for endpoint in ("start", "end"):
        dynamic = band.get(endpoint + "_dynamic")
        if dynamic:
            minute = solar(day, dynamic["event"]) if solar else None
            if minute is None:
                return None
            minute = max(0, min(1440, minute + dynamic["offset"]))
        else:
            minute = band[endpoint + "_minute"]
        values.append(minute)
    start, end = values
    if start > end:
        end = start
    return start, end


class SolarTimes:
    """Cache daily calculations, invalidated by location/timezone changes."""
    def __init__(self, hass):
        self.hass = hass
        self.signature = None
        self.cache = {}

    def __call__(self, day, event):
        config = self.hass.config
        signature = (config.latitude, config.longitude, config.elevation, config.time_zone)
        if signature != self.signature:
            self.signature = signature
            self.cache.clear()
        key = (day, event)
        if key not in self.cache:
            zone = ZoneInfo(config.time_zone)
            minute = None
            # Astral dates are UTC calendar dates. Find the event in this HA local
            # calendar day, including solar midnight and far-east/west locations.
            for delta in (0, -1, 1):
                instant = get_astral_event_date(self.hass, event, day + timedelta(days=delta))
                if instant is not None:
                    local = instant.astimezone(zone)
                    if local.date() == day:
                        minute = local.hour * 60 + local.minute
                        break
            if len(self.cache) > 512:
                self.cache.clear()
            self.cache[key] = minute
        return self.cache[key]
