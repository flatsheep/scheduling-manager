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
    """Return own/effective flags and both descriptive and immutable paths."""
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
            sub_disabled = band_disabled(sub, now)
            result[sub["id"]] = {
                **common,
                "path": f"{prefix}.{sub_names[sub['id']]}.disabled",
                "kind": "sub_schedule",
                "sub_schedule_id": sub["id"],
                "sub_schedule_name": label,
                "disabled": bool(parent_disabled or sub_disabled),
                "own_disabled": bool(sub_disabled),
                "parent_disabled": parent_disabled,
                "disabled_until": sub.get("disabled_until") if sub_disabled else None,
            }
            bands = [band for band in sub["bands"] if not band.get("one_off")]
            bases = [f"band-start-{_endpoint(band, 'start')}-stop-{_endpoint(band, 'end')}" for band in bands]
            counts = Counter(bases)
            for band, base in zip(bands, bases, strict=True):
                if counts[base] > 1:
                    base += f"__id_{band['id'].replace('-', '')}"
                own_disabled = band_disabled(band, now)
                result[band["id"]] = {
                    **common,
                    "path": f"{prefix}.{sub_names[sub['id']]}.{base}.disabled",
                    "legacy_paths": [
                        f"{prefix}.{sub_names[sub['id']]}.{base.replace('band-start-', 'band-on-').replace('-stop-', '-off-')}.disabled"
                    ],
                    "kind": "band",
                    "sub_schedule_id": sub["id"],
                    "sub_schedule_name": label,
                    "band_id": band["id"],
                    "start": _endpoint(band, "start"),
                    "stop": _endpoint(band, "end"),
                    "disabled": bool(parent_disabled or sub_disabled or own_disabled),
                    "own_disabled": bool(own_disabled),
                    "parent_disabled": bool(parent_disabled or sub_disabled),
                    "schedule_disabled": parent_disabled,
                    "sub_schedule_disabled": bool(sub_disabled),
                    "disabled_until": band.get("disabled_until") if own_disabled else None,
                }
    for key, state in result.items():
        state["id"] = key
        state["immutable_path"] = f"schedule_manager.id.{key}.disabled"
    return result


def matches_path(state: dict[str, Any], path: str) -> bool:
    """Legacy endpoint terms remain accepted; UUID paths survive all edits."""
    return path in (state["path"], state["immutable_path"], *state.get("legacy_paths", []))
