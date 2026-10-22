"""Readable control paths, with UUID identities independent of names and times."""

from collections import Counter
from datetime import datetime
from typing import Any

from homeassistant.util import slugify

from .bands import band_disabled


def _names(objects: list[dict[str, Any]], labels: list[str]) -> dict[str, str]:
    bases = ["_".join(filter(None, slugify(label).split("_"))) or "unnamed" for label in labels]
    counts = Counter(bases)
    # Normalized user names cannot contain a double underscore. The full UUID
    # therefore provides an unambiguous suffix without reserving user names.
    return {
        obj["id"]: base if counts[base] == 1 else f"{base}__id_{obj['id'].replace('-', '')}"
        for obj, base in zip(objects, bases, strict=True)
    }


def _endpoint(band: dict[str, Any], endpoint: str) -> str:
    if definition := band.get(endpoint + "_dynamic"):
        offset = definition["offset"]
        suffix = f"-{'plus' if offset > 0 else 'minus'}-{abs(offset)}" if offset else ""
        return definition["event"] + suffix
    minute = band[endpoint + "_minute"]
    return "2359" if minute == 1440 else f"{minute // 60:02}{minute % 60:02}"


def control_states(model: dict[str, Any], now: datetime) -> dict[str, dict[str, Any]]:
    """Return current paths and effective booleans, with no sub-schedule controls."""
    result: dict[str, dict[str, Any]] = {}
    schedules = model["schedules"]
    names = _names(schedules, [section["name"] for section in schedules])
    for section in schedules:
        prefix = f"schedule_manager.{names[section['id']]}"
        parent_disabled = not section.get("enabled", True)
        common = {
            "schedule_id": section["id"],
            "schedule_name": section["name"],
            "suspended_by_away": bool(model["away"] and section.get("away_enabled", True)),
        }
        result[section["id"]] = {
            **common,
            "path": prefix + ".disabled",
            "kind": "schedule",
            "disabled": parent_disabled,
            "own_disabled": parent_disabled,
            "parent_disabled": False,
            "disabled_until": None,
        }
        subs = section["sub_schedules"]
        labels = [sub.get("name") or f"sub_schedule_{index + 1}" for index, sub in enumerate(subs)]
        sub_names = _names(subs, labels)
        for sub, label in zip(subs, labels, strict=True):
            bands = sub["bands"]
            bases = [f"band-on-{_endpoint(band, 'start')}-off-{_endpoint(band, 'end')}" for band in bands]
            counts = Counter(bases)
            for band, base in zip(bands, bases, strict=True):
                if counts[base] > 1:
                    base += f"__id_{band['id'].replace('-', '')}"
                own_disabled = band_disabled(band, now)
                result[band["id"]] = {
                    **common,
                    "path": f"{prefix}.{sub_names[sub['id']]}.{base}.disabled",
                    "kind": "band",
                    "sub_schedule_id": sub["id"],
                    "sub_schedule_name": label,
                    "band_id": band["id"],
                    "disabled": bool(parent_disabled or own_disabled),
                    "own_disabled": bool(own_disabled),
                    "parent_disabled": parent_disabled,
                    "disabled_until": band.get("disabled_until") if own_disabled else None,
                }
    return result
