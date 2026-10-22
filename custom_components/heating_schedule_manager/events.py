"""Pure local-calendar event compilation, including DST gap/fold policy."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from .dynamic import resolve_band
from .bands import band_disabled
from .validation import away_time

UTC = timezone.utc


def wall_instant(day, minute, zone):
    naive = datetime.combine(day, datetime.min.time()) + timedelta(minutes=minute)
    # A round trip detects both imaginary local instants and ambiguous folds.
    # First valid minute after a gap, first UTC occurrence of a fold.
    for _ in range(1441):
        choices = []
        for fold in (0, 1):
            candidate = naive.replace(tzinfo=zone, fold=fold).astimezone(UTC)
            if candidate.astimezone(zone).replace(tzinfo=None) == naive:
                choices.append(candidate)
        if choices:
            return min(choices)
        naive += timedelta(minutes=1)
    raise ValueError("Timezone has no valid local day")


@dataclass(frozen=True)
class Event:
    instant: datetime
    order: tuple
    section: dict
    endpoint: str
    occurrence: str


def compile_events(model, zone_name, after, through, solar=None):
    """At most eight recent recurrence days suffice for final downtime effects."""
    zone = ZoneInfo(zone_name)
    first = max(after.astimezone(zone).date() - timedelta(days=1),
                through.astimezone(zone).date() - timedelta(days=8))
    last = through.astimezone(zone).date()
    result = []
    day = first
    while day <= last:
        for si, section in enumerate(model["schedules"]):
            if not section.get("enabled", True):
                continue
            for sub in section["sub_schedules"]:
                if day.weekday() not in sub["days"]:
                    continue
                for bi, band in enumerate(sub["bands"]):
                    resolved = resolve_band(band, day, solar)
                    if resolved is None:
                        continue
                    # A timed suspension ending inside this occurrence resumes
                    # its start settings once, in the same durable event stream.
                    if not band.get("enabled", True) and band.get("disabled_until"):
                        expiry = away_time(band["disabled_until"])
                        start = wall_instant(day, resolved[0], zone)
                        end = wall_instant(day, resolved[1], zone)
                        if after < expiry <= through and start < expiry < end:
                            logical = expiry.astimezone(zone).replace(tzinfo=None)
                            key = f"{model['revision']}:{section['id']}:{sub['id']}:{band['id']}:resume:{day}"
                            result.append(Event(expiry, (logical, 1, si, bi), section, "start", key))
                    for endpoint, field in (("start", "start_minute"), ("end", "end_minute")):
                        # A collapsed band has no active interval: its end wins,
                        # without an immediately-following start leaving it active.
                        if resolved[0] == resolved[1] and endpoint == "start":
                            continue
                        minute = resolved[0 if endpoint == "start" else 1]
                        instant = wall_instant(day, minute, zone)
                        if after < instant <= through and not band_disabled(band, instant):
                            logical = datetime.combine(day, datetime.min.time()) + timedelta(minutes=minute)
                            # Logical order retains spring-gap endpoints. At a common
                            # wall time, all ends precede starts, then persisted order.
                            order = (logical, 0 if endpoint == "end" else 1, si, bi)
                            key = f"{model['revision']}:{section['id']}:{sub['id']}:{band['id']}:{endpoint}:{day}"
                            result.append(Event(instant, order, section, endpoint, key))
        day += timedelta(days=1)
    return sorted(result, key=lambda event: (event.instant, event.order))


def band_active(sub, band, zone_name, instant, solar=None):
    """Whether this particular band is active on its assigned local weekday."""
    zone = ZoneInfo(zone_name)
    day = instant.astimezone(zone).date()
    if day.weekday() not in sub["days"] or band_disabled(band, instant):
        return False
    resolved = resolve_band(band, day, solar)
    return (resolved is not None and
            wall_instant(day, resolved[0], zone) <= instant < wall_instant(day, resolved[1], zone))


def section_active(section, zone_name, instant, solar=None):
    """Match real start/end instants, including the configured DST gap/fold policy."""
    if not section.get("enabled", True):
        return False
    return any(
        band_active(sub, band, zone_name, instant, solar)
        for sub in section["sub_schedules"] for band in sub["bands"]
    )
