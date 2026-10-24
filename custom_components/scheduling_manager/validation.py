"""Authoritative model and decimal-safe temperature validation."""
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone, tzinfo
from typing import Any
from uuid import UUID

from homeassistant.util.unit_conversion import TemperatureConverter
from .actions import state_value
from .dynamic import SOLAR_EVENTS


class Invalid(ValueError):
    def __init__(self, path, message):
        self.path = path
        super().__init__(f"{path}: {message}")


def require(ok, path, message):
    if not ok:
        raise Invalid(path, message)


def away_time(value: Any, zone: tzinfo | None = None, now: datetime | None = None) -> datetime:
    """Resolve a return time to UTC; local inputs use HA's timezone, not the client."""
    require(isinstance(value, str), "away_until", "Choose a return date and time")
    try:
        instant = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        raise Invalid("away_until", "Choose a valid return date and time") from None
    if instant.tzinfo is None:
        if zone is None:
            raise Invalid("away_until", "Saved return time must include a timezone")
        choices = {instant.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc)
                   for fold in (0, 1)
                   if instant.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == instant}
        require(bool(choices), "away_until", "This time does not exist in Home Assistant's timezone")
        future = {choice for choice in choices if now is None or choice > now}
        instant = min(future or choices)
    instant = instant.astimezone(timezone.utc)
    require(now is None or instant > now, "away_until", "Return time must be in the future")
    return instant


def identifier(value, path):
    try:
        UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise Invalid(path, "Expected a UUID") from None


def number(value, path):
    require(type(value) in (int, float), path, "Expected a finite number")
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        raise Invalid(path, "Expected a finite number") from None
    require(result.is_finite(), path, "Expected a finite number")
    return result


def temperature(value, cap, path="temperature"):
    require(isinstance(value, dict), path, "Expected value and unit")
    unit = value.get("unit")
    require(unit in ("°C", "°F"), path, "Unit must be °C or °F")
    raw = number(value.get("value"), path)
    require(cap and cap.get("supported"), path, "Device cannot accept a single target temperature")
    converted = TemperatureConverter.convert(float(raw), unit, cap["unit"])
    # Only eliminate floating-point conversion noise, never round to a device step.
    decimal = Decimal(str(round(converted, 9)))
    low, high, step = (Decimal(str(cap[k])) for k in ("min", "max", "step"))
    require(low <= decimal <= high, path, f"Must be between {low} and {high} {cap['unit']}")
    require(step > 0 and (decimal - low) % step == 0, path,
            f"Must follow {step} increments from {low}; unit conversion may require correction")
    return float(decimal)


def validate(model, capabilities):
    """Return canonical configuration. IDs are globally unique within their type."""
    result = deepcopy(model)
    require(type(result.get("away")) is bool, "away", "Expected boolean")
    deadline = result.get("away_until")
    if deadline is not None:
        require(result["away"], "away_until", "A return time requires Away to be on")
        result["away_until"] = away_time(deadline).isoformat()
    else:
        result.pop("away_until", None)
    settings = result.get("entity_settings")
    schedules = result.get("schedules")
    require(isinstance(settings, dict) and isinstance(schedules, list), "model", "Invalid model")
    require(all(isinstance(s, dict) and isinstance(s.get("entities"), list) and
                all(isinstance(m, dict) for m in s["entities"]) for s in schedules), "schedules", "Invalid sections or memberships")
    referenced = {m.get("entity_key") for s in schedules for m in s["entities"] if isinstance(m.get("entity_key"), str)}
    settings = {key: setting for key, setting in settings.items() if key in referenced}
    seen = set()
    used = set()
    entity_ids = set()
    for key, setting in settings.items():
        identifier(key, "entity_settings.key")
        require(isinstance(setting, dict), key, "Expected entity settings")
        eid = setting.get("entity_id", "")
        require(isinstance(eid, str) and "." in eid and eid not in entity_ids, key, "Invalid or duplicate entity")
        entity_ids.add(eid)
        if eid.startswith("climate."):
            temperature(setting.get("setback"), capabilities.get(eid), f"{key}.setback")
        else:
            require(capabilities.get(eid, {}).get("supported"), key, "Entity has no supported state-setting action")
            setting.pop("setback", None)
    for index, section in enumerate(schedules):
        path = f"schedules[{index}]"
        require(type(section.get("enabled", True)) is bool, path + ".enabled", "Expected boolean")
        section["enabled"] = section.get("enabled", True)
        require(type(section.get("away_enabled", True)) is bool, path + ".away_enabled", "Expected boolean")
        section["away_enabled"] = section.get("away_enabled", True)
        category = section.get("category")
        require(category is None or isinstance(category, str), path + ".category", "Expected a category name or null")
        section["category"] = (category.strip() or None) if category is not None else None
        require(isinstance(section.get("sub_schedules"), list) and all(isinstance(s, dict) for s in section["sub_schedules"]), path, "Invalid sub-schedules")
        for obj in [section, *section.get("sub_schedules", [])]:
            identifier(obj.get("id"), path + ".id")
            require(obj["id"] not in seen, path, "Duplicate ID")
            seen.add(obj["id"])
        name = section.get("name")
        require(isinstance(name, str) and bool(name.strip()), path + ".name", "Enter a name")
        section["name"] = name.strip()
        members = section.get("entities")
        require(isinstance(members, list) and bool(members), path + ".entities", "Add at least one writable entity")
        keys = set()
        for member in members:
            key = member.get("entity_key")
            require(isinstance(key, str) and key in settings and key not in keys, path + ".entities", "Unknown or duplicate entity")
            keys.add(key)
            used.add(key)
            eid = settings[key]["entity_id"]
            if eid.startswith("climate."):
                temperature(member.get("target"), capabilities.get(eid), path + ".target")
            else:
                for endpoint in ("start_state", "end_state"):
                    state_value(member.get(endpoint), capabilities.get(eid), path + "." + endpoint)
                if capabilities[eid].get("kind") == "number":
                    for endpoint in ("start", "end"):
                        field = endpoint + "_unit"
                        unit = capabilities[eid].get("unit") or ""
                        require(member.get(field, unit) == unit, path + "." + field, "Entity unit changed; choose this state value again")
                        member[field] = unit
                member.pop("target", None)
        subs = section.get("sub_schedules")
        require(isinstance(subs, list) and 1 <= len(subs) <= 7, path, "Use one to seven sub-schedules")
        days: set[int] = set()
        for si, sub in enumerate(subs):
            sp = f"{path}.sub_schedules[{si}]"
            require(type(sub.get("enabled", True)) is bool, sp + ".enabled", "Expected boolean")
            if sub.get("disabled_until") is not None:
                require(not sub.get("enabled", True), sp + ".disabled_until", "A disabled-until time requires a disabled sub-schedule")
                try:
                    sub["disabled_until"] = away_time(sub["disabled_until"]).isoformat()
                except Invalid as err:
                    raise Invalid(sp + ".disabled_until", str(err)) from None
            else:
                sub.pop("disabled_until", None)
            name = sub.get("name", "")
            require(isinstance(name, str), sp + ".name", "Expected a name string")
            if name.strip():
                sub["name"] = name.strip()
            else:
                sub.pop("name", None)
            selected = sub.get("days")
            require(isinstance(selected, list) and 1 <= len(selected) <= 7, sp + ".days", "Select at least one weekday")
            require(all(type(d) is int and 0 <= d <= 6 for d in selected), sp + ".days", "Invalid weekday")
            require(len(set(selected)) == len(selected) and not days.intersection(selected), sp + ".days", "Weekdays must be disjoint")
            days.update(selected)
            sub["days"] = sorted(selected)
            bands = sub.get("bands")
            require(isinstance(bands, list) and 0 <= len(bands) <= 10, sp + ".bands", "Use at most ten bands")
            require(all(isinstance(b, dict) and type(b.get("start_minute")) is int for b in bands), sp + ".bands", "Invalid bands")
            previous = 0
            for band in sorted(bands, key=lambda b: b.get("start_minute", -1)):
                identifier(band.get("id"), sp + ".band.id")
                require(band["id"] not in seen, sp, "Duplicate ID")
                seen.add(band["id"])
                bp = sp + ".band"
                require(type(band.get("one_off", False)) is bool, bp + ".one_off", "Expected boolean")
                if band.get("one_off"):
                    require(band.get("enabled", True) is True and band.get("disabled_until") is None,
                            bp, "One-off bands cannot be disabled individually")
                require(type(band.get("enabled", True)) is bool, bp + ".enabled", "Expected boolean")
                if band.get("disabled_until") is not None:
                    require(not band.get("enabled", True), bp + ".disabled_until", "A disabled-until time requires a disabled band")
                    try:
                        band["disabled_until"] = away_time(band["disabled_until"]).isoformat()
                    except Invalid as err:
                        raise Invalid(bp + ".disabled_until", str(err)) from None
                else:
                    band.pop("disabled_until", None)
                start, end = band.get("start_minute"), band.get("end_minute")
                require(type(start) is int and type(end) is int, sp, "Minutes must be integers")
                dynamic = False
                for endpoint in ("start", "end"):
                    definition = band.get(endpoint + "_dynamic")
                    if definition is not None:
                        require(isinstance(definition, dict) and set(definition) == {"event", "offset"}, sp, "Expected solar event and offset")
                        require(definition.get("event") in SOLAR_EVENTS, sp, "Unknown solar event")
                        require(type(definition.get("offset")) is int and -300 <= definition["offset"] <= 300, sp, "Offset must be integer minutes from -300 to 300")
                        dynamic = True
                    else:
                        band.pop(endpoint + "_dynamic", None)
                require(0 <= start <= 1440 and 0 <= end <= 1440 and start % 5 == end % 5 == 0, sp, "Use five-minute fixed endpoints")
                if not dynamic:
                    require(start < end, sp, "Use endpoints with positive duration")
                    require(previous <= start, sp, "Bands cannot overlap")
                    previous = end
            sub["bands"] = sorted(bands, key=lambda b: b["start_minute"])
    result["entity_settings"] = {key: value for key, value in settings.items() if key in used}
    return result
