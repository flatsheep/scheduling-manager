"""Persistent one-off occurrence definitions; no independent dispatch path."""
from copy import deepcopy
from datetime import date, timedelta

from homeassistant.util import dt as dt_util

from .bands import band_disabled
from .dynamic import resolve_band
from .validation import require


def bands(model):
    for section in model["schedules"]:
        for sub in section["sub_schedules"]:
            for band in sub["bands"]:
                if band.get("one_off"):
                    yield section, sub, band


TIME_FIELDS = ("start_minute", "end_minute", "start_dynamic", "end_dynamic")


def edited_ids(model, section_id, section):
    """Cancel old commands only for explicitly removed or retimed one-offs."""
    incoming = {}
    if isinstance(section, dict) and isinstance(section.get("sub_schedules"), list):
        for sub in section["sub_schedules"]:
            if isinstance(sub, dict) and isinstance(sub.get("bands"), list):
                incoming.update({b["id"]: b for b in sub["bands"] if isinstance(b, dict) and isinstance(b.get("id"), str)})
    return {b["id"] for s, _, b in bands(model) if s["id"] == section_id and
            (b["id"] not in incoming or any(b.get(f) != incoming[b["id"]].get(f) for f in TIME_FIELDS))}


def prepare(old_model, section, now, zone, solar, wall_instant):
    """Protect server-owned journals and immutable type on every editor save."""
    old = {b["id"]: (s, sub, b) for s in old_model["schedules"]
           for sub in s["sub_schedules"] for b in sub["bands"]}
    incoming = {b["id"]: (sub, b) for sub in section["sub_schedules"] for b in sub["bands"]}
    for previous_section, previous_sub, previous in bands(old_model):
        if previous_section["id"] != section["id"] or not previous.get("one_off_run"):
            continue
        if previous["id"] not in incoming:
            continue
        sub, band = incoming[previous["id"]]
        require(sub["id"] == previous_sub["id"] and sub["days"] == previous_sub["days"],
                "one_off", "Selected one-off weekdays are read-only")
        keys = {m["entity_key"] for m in section["entities"]}
        require(all(m["entity_key"] in keys for m in previous["one_off_run"]["entities"]),
                "one_off", "Keep participating entities until the one-off Stop is resolved")
    for sub, band in incoming.values():
        prior = old.get(band["id"])
        previous = prior[2] if prior else {}
        if prior:
            require(bool(band.get("one_off")) == bool(previous.get("one_off")),
                    "one_off", "One-off can only be chosen during creation")
        for field in ("one_off_after", "one_off_run", "one_off_partial"):
            band.pop(field, None)
            if field in previous:
                band[field] = deepcopy(previous[field])
        if band.get("one_off_run") and any(band.get(f) != previous.get(f) for f in TIME_FIELDS):
            run = band["one_off_run"]
            day = date.fromisoformat(run["day"])
            resolved = resolve_band(band, day, solar)
            require(resolved is not None and wall_instant(day, resolved[0], zone) < wall_instant(day, resolved[1], zone),
                    "one_off", "Edited occurrence must have an available, positive-duration interval")
            # Start's delivery history is immutable: editing its displayed time
            # cannot create another cycle. Stop moves on the original date.
            run["end"] = wall_instant(day, resolved[1], zone).isoformat()
            run["minutes"] = list(resolved)
            run.pop("end_recorded", None)
        if band.get("one_off") and not band.get("one_off_run"):
            changed = not prior or sub["days"] != prior[1]["days"] or any(
                band.get(f) != previous.get(f) for f in ("start_minute", "end_minute", "start_dynamic", "end_dynamic"))
            if changed:
                band["one_off_after"] = now.isoformat()
                band["one_off_partial"] = bool(section.get("enabled", True) and not band_disabled(sub, now)
                                               and not (old_model.get("away") and section.get("away_enabled", True)))


def occurrence(model, section, sub, band, zone, after, through, solar, wall_instant):
    """Find the first eligible interval, including creation inside a live band."""
    if run := band.get("one_off_run"):
        return run
    if not section.get("enabled", True) or (model.get("away") and section.get("away_enabled", True)):
        return None
    if not sub.get("enabled", True) and not sub.get("disabled_until"):
        return None
    activation = dt_util.parse_datetime(band["one_off_after"])
    # The initial partial interval remains recoverable even when its Stop is
    # already behind the cursor (including bands created by earlier releases).
    # Gates at creation are captured on Save so later enabling cannot invent it.
    creation_day = activation.astimezone(zone).date()
    if (band.get("one_off_partial", True) and creation_day.weekday() in sub["days"]
            and (resolved := resolve_band(band, creation_day, solar))):
        start, end = (wall_instant(creation_day, minute, zone) for minute in resolved)
        if start < activation < end and not band_disabled(sub, activation):
            return make_run(model, section, activation, end, creation_day, resolved)
    lower = max(after, activation)
    day = lower.astimezone(zone).date()
    last = through.astimezone(zone).date()
    while day <= last:
        if day.weekday() in sub["days"] and (resolved := resolve_band(band, day, solar)):
            start, end = (wall_instant(day, minute, zone) for minute in resolved)
            if start >= activation and start > after and start < end and not band_disabled(sub, start):
                return make_run(model, section, start, end, day, resolved)
        day += timedelta(days=1)
    return None


def make_run(model, section, start, end, day, resolved):
    return {"start": start.isoformat(), "end": end.isoformat(), "day": str(day),
            "minutes": list(resolved), "entities": deepcopy(section["entities"]),
            "settings": {m["entity_key"]: deepcopy(model["entity_settings"][m["entity_key"]])
                         for m in section["entities"]}}


def record(candidate, event):
    """Commit occurrence selection and logical endpoints with the desired journal."""
    if not event.one_off:
        return
    band = next(b for _, _, b in bands(candidate["model"]) if b["id"] == event.band_id)
    if "one_off_run" not in band:
        band["one_off_run"] = deepcopy(event.one_off)
        candidate["model"]["revision"] += 1
    band["one_off_run"][event.endpoint + "_recorded"] = True


def finish(candidate):
    """Retire resolved Stops; a newer desired command supersedes an older Stop."""
    pending = {c.get("one_off_id") for c in candidate["runtime"]["pending"].values()}
    done = {b["id"] for _, _, b in bands(candidate["model"])
            if b.get("one_off_run", {}).get("end_recorded") and b["id"] not in pending}
    if not done:
        return False
    for section in candidate["model"]["schedules"]:
        for sub in section["sub_schedules"]:
            sub["bands"] = [b for b in sub["bands"] if b["id"] not in done]
    candidate["model"]["revision"] += 1
    return True
