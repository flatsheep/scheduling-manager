"""Serialized, journalled transition scheduler. No thermostat ownership loop."""
import asyncio
from collections import deque
from collections.abc import Callable
from copy import deepcopy
from datetime import date, timedelta
from zoneinfo import ZoneInfo
import logging
from typing import Any

from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .capabilities import read_capabilities, cache_valid
from .actions import state_action
from .const import DOMAIN, SIGNAL, VERSION
from .events import band_active, compile_events, section_active
from .bands import band_disabled
from .dynamic import SOLAR_EVENTS, SolarTimes
from .storage import inspect_store
from .validation import Invalid, away_time, identifier, require, temperature, validate

_LOGGER = logging.getLogger(__name__)
UNTIL_UNSET = object()
CAPABILITY_FIELDS = ("options", "supported_features", "min", "max", "step", "min_temp", "max_temp",
                     "target_temp_step", "operation_list", "unit_of_measurement", "pattern",
                     "has_date", "has_time", "code_arm_required", "code_format")


def climate(model, key):
    return model["entity_settings"][key]["entity_id"].startswith("climate.")


def away_for(model, section):
    return model["away"] and section.get("away_enabled", True)


def member_value(model, member, endpoint):
    key = member["entity_key"]
    if climate(model, key):
        return member["target"] if endpoint == "start" else model["entity_settings"][key]["setback"]
    return member["start_state" if endpoint == "start" else "end_state"]


def record_value(record):
    return record.get("temperature", record.get("state"))


def member_unit(member, endpoint):
    return member.get(endpoint + "_unit")


def execution_section(section):
    """Display metadata must never invalidate desired actions or Away history."""
    return {"entities": section["entities"],
            "enabled": section.get("enabled", True),
            "away_enabled": section.get("away_enabled", True),
            "sub_schedules": [{field: sub[field] for field in ("id", "days", "bands")}
                              for sub in section["sub_schedules"]]}


def initial(now, zone):
    return {
        "schema_version": VERSION,
        "model": {"revision": 0, "away": False, "entity_settings": {}, "schedules": []},
        "runtime": {"cursor": now.isoformat(), "zone": zone, "sequence": 0,
                    "normal": {}, "pre_away": {}, "away_logical": {}, "pending": {}, "errors": {}},
        "capabilities": {},
    }


class Manager:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, VERSION, DOMAIN)
        self.lock = asyncio.Lock()
        self.snapshot: dict[str, Any] = {}
        self.cancel_timer: Callable[[], None] | None = None
        self.unsubscribers: list[Callable[[], None]] = []
        self.closed = False
        self.generation = 0
        self.storage_error: str | None = None
        self.command_contexts: deque[str] = deque(maxlen=512)
        self.solar: Callable[[date, str], int | None] = SolarTimes(hass)
        self.entity_keys: dict[str, set[str]] = {}
        self.entity_domains: set[str] = set()
        self._index_signature: tuple[tuple[str, str], ...] | None = None
        self._notification: asyncio.Handle | None = None
        self._dispatch_task: asyncio.Task | None = None

    @property
    def model(self) -> dict[str, Any]:
        return self.snapshot["model"]

    async def start(self) -> None:
        if isinstance(self.store, Store):
            await self.hass.async_add_executor_job(inspect_store, self.store.path)
        stored = await self.store.async_load()
        self.snapshot = stored if stored is not None else initial(dt_util.utcnow(), self.hass.config.time_zone)
        require(self.snapshot.get("schema_version") == VERSION, "storage", "Unsupported schema version")
        require(isinstance(self.snapshot.get("runtime"), dict), "storage", "Invalid runtime journal")
        cached = self.snapshot.get("capabilities", {})
        entity_ids = {setting["entity_id"] for setting in self.model["entity_settings"].values()}
        current = read_capabilities(self.hass, cached, entity_ids)
        # Saved values may become unsupported after a mode/unit change. Loading
        # still succeeds; current capabilities are authoritative at dispatch.
        self.snapshot["model"] = validate(self.model, {**current, **cached})
        self.snapshot["capabilities"] = cache_valid(current, cached, entity_ids)
        self._reindex()
        runtime = self.snapshot["runtime"]
        require(dt_util.parse_datetime(runtime.get("cursor", "")) is not None, "storage.cursor", "Invalid progress cursor")
        for field in ("normal", "pre_away", "away_logical", "pending", "errors"):
            require(isinstance(runtime.get(field), dict), f"storage.{field}", "Invalid journal")
        require(type(runtime.get("sequence")) is int, "storage.sequence", "Invalid sequence")
        self.unsubscribers.extend([
            self.hass.bus.async_listen("state_changed", self._state_changed),
            self.hass.bus.async_listen("entity_registry_updated", self._registry_changed),
            self.hass.bus.async_listen("core_config_updated", self._timezone_changed),
            self.hass.bus.async_listen("service_registered", self._service_registered),
            self.hass.bus.async_listen("device_registry_updated", self._location_changed),
            self.hass.bus.async_listen("area_registry_updated", self._location_changed),
            self.hass.bus.async_listen("floor_registry_updated", self._location_changed),
        ])
        await self._refresh_environment()
        await self.tick()
        async with self.lock:
            caps = self.capabilities(set(self.entity_keys))
            available = {key for key, setting in self.model["entity_settings"].items()
                          if caps.get(setting["entity_id"], {}).get("available")}
            await self._drain(available)

    async def stop(self) -> None:
        self.closed = True
        self.generation += 1
        if self._notification:
            self._notification.cancel()
            self._notification = None
        if self.cancel_timer:
            self.cancel_timer()
        for unsub in self.unsubscribers:
            unsub()
        self.unsubscribers.clear()
        # A dispatch already holding the lock completes before unload returns.
        async with self.lock:
            pass

    def public(self) -> dict[str, Any]:
        now = dt_util.utcnow()
        today = now.astimezone(ZoneInfo(self.hass.config.time_zone)).date()
        solar_times = {str(day): {event: self.solar(day, event) for event in SOLAR_EVENTS}
                       for day in (today + timedelta(days=i) for i in range(8))}
        return {"model": deepcopy(self.model), "timezone": self.hass.config.time_zone,
                 "solar_times": solar_times,
                "active_schedules": {section["id"]: not away_for(self.model, section) and
                                     section_active(section, self.hass.config.time_zone, now, self.solar)
                                     for section in self.model["schedules"]},
                 "status": deepcopy(self.snapshot["runtime"]["errors"]),
                 "applying": any(key not in self.snapshot["runtime"]["errors"] for key in self.snapshot["runtime"]["pending"]),
                  "storage_error": self.storage_error}

    def schedule_activity(self) -> dict[str, dict[str, Any]]:
        """Return effective activity and the next scheduled endpoint per section."""
        now = dt_util.utcnow()
        events = compile_events(
            self.model, self.hass.config.time_zone, now, now + timedelta(days=8), self.solar
        )
        next_events: dict[str, Any] = {}
        for event in events:
            next_events.setdefault(event.section["id"], event)
        return {
            section["id"]: {
                "active": not away_for(self.model, section)
                and section_active(section, self.hass.config.time_zone, now, self.solar),
                "next_transition": (
                    {"at": event.instant.isoformat(), "endpoint": event.endpoint}
                    if (event := next_events.get(section["id"]))
                    else None
                ),
            }
            for section in self.model["schedules"]
        }

    def capabilities(self, entity_ids: set[str] | None = None) -> dict[str, Any]:
        return read_capabilities(self.hass, self.snapshot["capabilities"], entity_ids)

    def _reindex(self):
        signature = tuple((key, setting["entity_id"]) for key, setting in self.model["entity_settings"].items())
        if signature == self._index_signature:
            return
        self._index_signature = signature
        self.entity_keys = {eid: {key} for key, eid in signature}
        self.entity_domains = {eid.split(".", 1)[0] for eid in self.entity_keys}

    async def _persist(self, candidate):
        entity_ids = {setting["entity_id"] for setting in candidate["model"]["entity_settings"].values()}
        candidate["capabilities"] = cache_valid({}, candidate["capabilities"], entity_ids)
        try:
            await self.store.async_save(candidate)
        except Exception as err:
            self.storage_error = str(err)
            self._notify()
            raise
        self.snapshot = candidate
        self._reindex()
        self.storage_error = None

    def _notify(self):
        if self.closed or self._notification:
            return

        @callback
        def publish():
            self._notification = None
            if not self.closed:
                async_dispatcher_send(self.hass, SIGNAL)

        self._notification = self.hass.loop.call_soon(publish)

    def _arm(self):
        if self.cancel_timer:
            self.cancel_timer()
            self.cancel_timer = None
        if self.closed:
            return
        now = dt_util.utcnow()
        cursor = dt_util.parse_datetime(self.snapshot["runtime"]["cursor"])
        overdue = compile_events(self.model, self.hass.config.time_zone, cursor, now, self.solar) if cursor < now else []
        events = compile_events(self.model, self.hass.config.time_zone, max(now, cursor), max(now, cursor) + timedelta(days=8), self.solar)
        # Refresh the published daily solar table at least daily, even when the
        # next device transition is several days away.
        when = min(events[0].instant, now + timedelta(days=1)) if events else now + timedelta(days=1)
        if overdue:
            when = now
        if deadline := self.model.get("away_until"):
            when = min(when, max(now, away_time(deadline)))
        for section in self.model["schedules"]:
            for sub in section["sub_schedules"]:
                for band in sub["bands"]:
                    if not band.get("enabled", True) and band.get("disabled_until"):
                        expiry = away_time(band["disabled_until"])
                        if expiry > now:
                            when = min(when, expiry)
        if self.storage_error and when <= now:
            when = now + timedelta(seconds=60)
        token = self.generation

        @callback
        def due(_):
            self.hass.async_create_task(self.tick(token))

        self.cancel_timer = async_track_point_in_utc_time(self.hass, due, when)

    def _desired(self, candidate, key, value, source, state_unit=None, only_if_changed=False):
        runtime = candidate["runtime"]
        runtime["sequence"] += 1
        command = {"temperature" if climate(candidate["model"], key) else "state": deepcopy(value), "source": source, "sequence": runtime["sequence"]}
        if state_unit is not None:
            command["state_unit"] = state_unit
        if only_if_changed:
            command["only_if_changed"] = True
        runtime["pending"][key] = command
        runtime["errors"].pop(key, None)

    def _normal(self, candidate, key, value, source, **metadata):
        runtime = candidate["runtime"]
        record = {"temperature" if climate(candidate["model"], key) else "state": deepcopy(value),
                  "source": source, "sequence": runtime["sequence"] + 1, **metadata}
        runtime["normal"][key] = record
        if candidate["model"]["away"]:
            runtime["away_logical"][key] = record

    def _cancel_source_pending(self, candidate, source, keys=None):
        runtime = candidate["runtime"]
        removed = {k for k, c in runtime["pending"].items() if c.get("source") == source and (keys is None or k in keys)}
        for key in removed:
            runtime["pending"].pop(key, None)
            runtime["errors"].pop(key, None)

    def _away_climate(self, model):
        return {m["entity_key"] for s in model["schedules"] if s.get("away_enabled", True)
                for m in s["entities"] if climate(model, m["entity_key"])}

    def _record_events(self, candidate, events, skip_state_sources=frozenset(), value_model=None, skip_all_sources=frozenset()):
        """Journal ordered logical progress without writes or physical actions."""
        runtime = candidate["runtime"]
        value_model = value_model or candidate["model"]
        for source in skip_state_sources:
            self._cancel_source_pending(candidate, source, {key for key in runtime["pending"] if not climate(candidate["model"], key)})
        batches = []
        for event in events:
            for member in event.section["entities"]:
                key = member["entity_key"]
                if key not in candidate["model"]["entity_settings"]:
                    continue
                normal = member_value(value_model, member, event.endpoint)
                unit = member_unit(member, event.endpoint)
                self._normal(candidate, key, normal, event.section["id"], occurrence=event.occurrence, **({"state_unit": unit} if unit is not None else {}))
                if away_for(value_model, event.section) or event.section["id"] in skip_all_sources or (event.section["id"] in skip_state_sources and not climate(candidate["model"], key)):
                    # Away suspends every normal endpoint, retaining logical
                    # progress without repeating climate setback commands.
                    self._cancel_source_pending(candidate, event.section["id"], {key})
                    runtime["sequence"] += 1
                    continue
                desired = value_model["entity_settings"][key]["setback"] if away_for(value_model, event.section) else normal
                self._desired(candidate, key, desired, event.section["id"], unit)
                batches.append((key, deepcopy(runtime["pending"][key]), event))
        return batches

    async def _advance(self, now, skip_state_sources=frozenset(), skip_all_sources=frozenset()):
        await self._expire_away(now)
        candidate = deepcopy(self.snapshot)
        runtime = candidate["runtime"]
        cursor = dt_util.parse_datetime(runtime["cursor"])
        if now <= cursor:
            return
        events = compile_events(candidate["model"], runtime["zone"], cursor, now, self.solar)
        # Ordinary same-instant batches retain each command, except DST collapse.
        # Late timers/downtime coalesce to each entity's final desired command.
        live = events and (now - events[0].instant).total_seconds() < 2
        batches = self._record_events(candidate, events, skip_state_sources, skip_all_sources=skip_all_sources)
        runtime["cursor"] = now.isoformat()
        await self._persist(candidate)  # desired journal exists before service calls
        if live:
            # A spring gap collapses multiple distinct local times onto one UTC
            # instant: coalesce only those physical effects, retaining logical order.
            collapsed = len({e.order[0] for e in events}) > len({e.instant for e in events})
            if not collapsed:
                for key, command, _ in batches:
                    await self._send(key, command)
                return
        await self._drain()

    async def tick(self, token=None):
        async with self.lock:
            if self.closed or (token is not None and token != self.generation):
                return
            try:
                await self._advance(dt_util.utcnow())
                # Also recovers work journalled just before a crash.
                await self._drain()
            except Exception:
                _LOGGER.exception("Scheduler persistence/dispatch failed")
            finally:
                self._arm()
                self._notify()

    async def _send(self, key, command):
        setting = self.model["entity_settings"].get(key)
        if not setting or self.closed:
            return
        eid = setting["entity_id"]
        source = next((s for s in self.model["schedules"] if s["id"] == command.get("source")), None)
        if source and away_for(self.model, source) and not climate(self.model, key):
            candidate = deepcopy(self.snapshot)
            self._cancel_source_pending(candidate, source["id"], {key})
            await self._persist(candidate)
            return
        cap = self.capabilities({eid}).get(eid)
        context = Context()
        self.command_contexts.append(context.id)
        error = None
        try:
            if cap is None or not cap["available"]:
                raise Invalid(eid, "Entity unavailable; newest transition is pending")
            if climate(self.model, key):
                requested = setting["setback"] if source and away_for(self.model, source) else command["temperature"]
                service, data = "set_temperature", {"temperature": temperature(requested, cap, eid)}
            else:
                if cap.get("kind") == "number" and "state_unit" in command:
                    require(command["state_unit"] == (cap.get("unit") or ""), eid, "Entity unit changed; choose the state value again")
                service, data = state_action(command["state"], cap, eid)
            unchanged = command.get("only_if_changed") and climate(self.model, key) and type(cap.get("current")) in (int, float) and cap["current"] == data["temperature"]
            if not unchanged:
                async with asyncio.timeout(20):
                    await self.hass.services.async_call(cap.get("service_domain", eid.split(".", 1)[0]), service,
                        {"entity_id": eid, **data}, blocking=True, context=context)
        except Exception as err:
            error = str(err)
        candidate = deepcopy(self.snapshot)
        candidate["capabilities"] = cache_valid(self.capabilities({eid}), candidate["capabilities"])
        runtime = candidate["runtime"]
        pending = runtime["pending"].get(key)
        if error:
            runtime["errors"][key] = {"entity_id": eid, "message": error, "sequence": command["sequence"]}
            if pending and pending["sequence"] == command["sequence"]:
                pending["attempt_context"] = context.id
        else:
            runtime["errors"].pop(key, None)
            if pending and pending["sequence"] == command["sequence"]:
                runtime["pending"].pop(key)
        await self._persist(candidate)

    async def _drain(self, only=None):
        for key, command in list(self.snapshot["runtime"]["pending"].items()):
            if only is None or key in only:
                # Pending errors are retried only on availability recovery or an
                # explicit newer event. No periodic enforcement or retry loop.
                if only is not None or key not in self.snapshot["runtime"]["errors"]:
                    await self._send(key, command)

    async def _dispatch_committed(self):
        try:
            await self._drain()
        except Exception:
            # Configuration already committed. Report runtime journal failure
            # separately instead of falsely returning a failed section Save.
            _LOGGER.exception("Post-commit command journal failed")
        self._notify()

    def _queue_dispatch(self):
        """Acknowledge durable Away configuration before slow device delivery."""
        if self.closed or (self._dispatch_task and not self._dispatch_task.done()):
            return
        self._dispatch_task = self.hass.async_create_task(self._deferred_dispatch())

    async def _deferred_dispatch(self):
        async with self.lock:
            if not self.closed:
                # Read current pending work, not a captured stale command batch.
                await self._dispatch_committed()

    def _temperature_matches(self, model, key, value):
        cap = self.capabilities({model["entity_settings"][key]["entity_id"]}).get(model["entity_settings"][key]["entity_id"])
        if not cap or not cap.get("available") or type(cap.get("current")) not in (int, float):
            return False
        try:
            return cap["current"] == temperature(value, cap)
        except Invalid:
            return False

    async def save_section(self, expected_revision, operation, section_id, section=None, settings=None):
        async with self.lock:
            require(not self.closed, "manager", "Integration unloaded")
            await self._expire_away(dt_util.utcnow())
            identifier(section_id, "section_id")
            require(type(expected_revision) is int, "revision", "Expected integer revision")
            require(expected_revision == self.model["revision"], "revision", "Conflict: reload saved state; your unsaved changes are retained")
            require(operation in ("upsert", "delete"), "operation", "Use upsert or delete")
            candidate = deepcopy(self.snapshot)
            model = candidate["model"]
            index = next((i for i, s in enumerate(model["schedules"]) if s["id"] == section_id), None)
            if operation == "delete":
                require(index is not None, "section_id", "Unknown section")
                model["schedules"].pop(index)
                require(not settings, "settings", "Deletion cannot change shared settings")
            else:
                require(isinstance(section, dict) and section.get("id") == section_id, "section", "Section ID mismatch")
                current_enabled = model["schedules"][index].get("enabled", True) if index is not None else True
                require(type(section.get("enabled", current_enabled)) is bool, "section.enabled", "Expected boolean")
                require(section.get("enabled", current_enabled) == current_enabled, "section.enabled", "Use the Enable/Disable control to change this state")
                section = deepcopy({**section, "enabled": current_enabled})
                old_bands = {b["id"]: b for s in (model["schedules"][index]["sub_schedules"] if index is not None else []) for b in s["bands"]}
                require(isinstance(section.get("sub_schedules"), list), "section.sub_schedules", "Invalid sub-schedules")
                for sub in section.get("sub_schedules", []):
                    if not isinstance(sub, dict):
                        continue
                    require(isinstance(sub.get("bands"), list), "section.bands", "Invalid bands")
                    for band in sub.get("bands", []):
                        if not isinstance(band, dict) or band.get("disabled_until") is None:
                            continue
                        identifier(band.get("id"), "band.id")
                        old_deadline = old_bands.get(band.get("id"), {}).get("disabled_until")
                        if band["disabled_until"] != old_deadline:
                            try:
                                band["disabled_until"] = away_time(band["disabled_until"], self.hass.config.time_zone, dt_util.utcnow()).isoformat()
                            except Invalid as err:
                                raise Invalid("band.disabled_until", str(err)) from None
                require(isinstance(section.get("entities"), list) and all(isinstance(m, dict) and isinstance(m.get("entity_key"), str) for m in section["entities"]), "section.entities", "Invalid memberships")
                if index is not None:
                    prior = {m["entity_key"]: m for m in model["schedules"][index]["entities"]}
                    for member in section["entities"]:
                        for field in ("start_unit", "end_unit"):
                            if field not in member and field in prior.get(member["entity_key"], {}):
                                member[field] = prior[member["entity_key"]][field]
                allowed = {m["entity_key"] for m in section.get("entities", [])}
                for key, setting in (settings or {}).items():
                    require(key in allowed, "settings", "Shared updates must reference section members")
                    require(isinstance(setting, dict) and isinstance(setting.get("entity_id"), str), "settings", "Expected entity identity")
                    previous = model["entity_settings"].get(key)
                    require(not previous or (previous["entity_id"] == setting.get("entity_id") and previous.get("registry_id") == setting.get("registry_id")), "settings", "Cannot replace entity identity")
                    # Never trust client-supplied registry identity for new entities.
                    actual = self.capabilities({setting["entity_id"]}).get(setting["entity_id"]) if not previous else None
                    require(previous or (actual and actual["available"] and actual["supported"]), "settings", "New entity must be available and supported")
                    model["entity_settings"][key] = {"entity_id": setting["entity_id"],
                        "registry_id": previous.get("registry_id") if previous else (actual or {}).get("registry_id")}
                    if setting["entity_id"].startswith("climate."):
                        require("setback" in setting, "settings.setback", "Expected shared setback")
                        model["entity_settings"][key]["setback"] = deepcopy(setting["setback"])
                if index is None:
                    model["schedules"].append(deepcopy(section))
                else:
                    model["schedules"][index] = deepcopy(section)
            entity_ids = {setting["entity_id"] for setting in model["entity_settings"].values()}
            current_capabilities = self.capabilities(entity_ids)
            candidate["model"] = validate(model, current_capabilities)
            candidate["capabilities"] = cache_valid(current_capabilities, candidate["capabilities"])
            model = candidate["model"]
            now = dt_util.utcnow()
            previous_cursor = dt_util.parse_datetime(self.snapshot["runtime"]["cursor"])
            resume_band = None
            if operation == "upsert" and index is not None:
                old_bands = {b["id"]: b for sub in self.model["schedules"][index]["sub_schedules"] for b in sub["bands"]}
                saved_section = model["schedules"][index]
                if saved_section.get("enabled", True) and not away_for(model, saved_section):
                    resume_band = next((band for sub in saved_section["sub_schedules"] for band in sub["bands"]
                                        if band.get("enabled", True) and band["id"] in old_bands
                                        and (band_disabled(old_bands[band["id"]], now) or (
                                            not old_bands[band["id"]].get("enabled", True)
                                            and old_bands[band["id"]].get("disabled_until")
                                            and previous_cursor < away_time(old_bands[band["id"]]["disabled_until"]) <= now))
                                        and band_active(sub, band, self.hass.config.time_zone, now, self.solar)), None)
            execution_changed = operation == "delete" or index is None
            if not execution_changed:
                old_section = self.model["schedules"][index]
                new_section = model["schedules"][index]
                execution_changed = execution_section(old_section) != execution_section(new_section) or any(self.model["entity_settings"].get(member["entity_key"]) != model["entity_settings"].get(member["entity_key"]) for member in new_section["entities"])
            model["revision"] += 1
            at_cutover = execution_changed and previous_cursor < now and bool(compile_events(model, self.hass.config.time_zone, now - timedelta(microseconds=1), now, self.solar))
            candidate["runtime"]["cursor"] = ((now - timedelta(microseconds=1) if at_cutover else max(now, previous_cursor)) if execution_changed else previous_cursor).isoformat()
            # Deleted/replaced source records may not control Away exit or retry.
            valid_keys = set(model["entity_settings"])
            for field in ("normal", "pre_away", "away_logical", "pending"):
                candidate["runtime"][field] = {
                    k: v for k, v in candidate["runtime"][field].items()
                    if k in valid_keys and (not execution_changed or v.get("source") != section_id)
                }
            candidate["runtime"]["errors"] = {k: v for k, v in candidate["runtime"]["errors"].items() if k in candidate["runtime"]["pending"]}
            if execution_changed:
                # The edited source has a cutover, not a retroactive start. Other
                # sources must retain overdue progress in the same atomic commit.
                through = now - timedelta(microseconds=1) if at_cutover else now
                if through > previous_cursor:
                    overdue = [event for event in compile_events(self.model, self.snapshot["runtime"]["zone"], previous_cursor, through, self.solar)
                               if event.section["id"] != section_id]
                    self._record_events(candidate, overdue, value_model=self.model)
            if model["away"]:
                included = self._away_climate(model)
                for key, command in list(candidate["runtime"]["pending"].items()):
                    if command.get("source") == "away" and key not in included:
                        candidate["runtime"]["pending"].pop(key)
                        candidate["runtime"]["errors"].pop(key, None)
                for key in included:
                    old = self.model["entity_settings"].get(key)
                    newly_included = key not in self._away_climate(self.model)
                    if not old or newly_included or old["setback"] != model["entity_settings"][key]["setback"]:
                        self._desired(candidate, key, model["entity_settings"][key]["setback"], "away", only_if_changed=True)
                        candidate["runtime"]["errors"].pop(key, None)
            if resume_band is not None and index is not None:
                # Enabling through the draft commits the start with the new
                # settings. An exact-boundary scheduled start handles itself.
                scheduled_start = at_cutover and any(
                    event.section["id"] == section_id and f":{resume_band['id']}:start:" in event.occurrence
                    for event in compile_events(model, self.hass.config.time_zone, now - timedelta(microseconds=1), now, self.solar)
                )
                if not scheduled_start:
                    for member in model["schedules"][index]["entities"]:
                        key = member["entity_key"]
                        value = member_value(model, member, "start")
                        unit = member_unit(member, "start")
                        self._normal(candidate, key, value, section_id, control="band_enable", band_id=resume_band["id"],
                                     **({"state_unit": unit} if unit is not None else {}))
                        self._desired(candidate, key, value, section_id, unit)
            await self._persist(candidate)
            self.generation += 1
            self._arm()
            self._notify()
            if at_cutover:
                try:
                    await self._advance(now)
                except Exception:
                    _LOGGER.exception("Cutover endpoint journal failed")
            if execution_changed:
                await self._dispatch_committed()
            return self.public()

    async def enable_band(self, expected_revision, section_id, band_id, defer_dispatch=False):
        """Enable a saved band, applying start settings only if it is active now."""
        async with self.lock:
            require(not self.closed, "manager", "Integration unloaded")
            await self._expire_away(dt_util.utcnow())
            identifier(section_id, "section_id")
            identifier(band_id, "band_id")
            require(type(expected_revision) is int and expected_revision == self.model["revision"], "revision", "Conflict: reload saved state; your unsaved changes are retained")
            section = next((s for s in self.model["schedules"] if s["id"] == section_id), None)
            if section is None:
                raise Invalid("section_id", "Unknown section")
            band = next((b for sub in section["sub_schedules"] for b in sub["bands"] if b["id"] == band_id), None)
            if band is None:
                raise Invalid("band_id", "Unknown band")
            if band.get("enabled", True):
                return self.public()
            now = dt_util.utcnow()
            was_disabled = band_disabled(band, now)
            # Finish old-model progress before enabling. An endpoint at this
            # boundary is not replayed by the newly enabled band.
            await self._advance(now)
            candidate = deepcopy(self.snapshot)
            section = next(s for s in candidate["model"]["schedules"] if s["id"] == section_id)
            sub, band = next((sub, b) for sub in section["sub_schedules"] for b in sub["bands"] if b["id"] == band_id)
            band.pop("enabled", None)
            band.pop("disabled_until", None)
            candidate["model"]["revision"] += 1
            if (was_disabled and section.get("enabled", True) and not away_for(candidate["model"], section)
                    and band_active(sub, band, self.hass.config.time_zone, now, self.solar)):
                for member in section["entities"]:
                    key = member["entity_key"]
                    value = member_value(candidate["model"], member, "start")
                    unit = member_unit(member, "start")
                    self._normal(candidate, key, value, section_id, control="band_enable", band_id=band_id,
                                 **({"state_unit": unit} if unit is not None else {}))
                    self._desired(candidate, key, value, section_id, unit)
            await self._persist(candidate)
            self.generation += 1
            self._arm()
            self._notify()
            if defer_dispatch:
                self._queue_dispatch()
            else:
                await self._dispatch_committed()
            return self.public()

    async def set_section_enabled(self, expected_revision, section_id, enabled, defer_dispatch=False):
        """Explicit immediate command plus a persisted, future-transition toggle."""
        async with self.lock:
            require(not self.closed, "manager", "Integration unloaded")
            await self._expire_away(dt_util.utcnow())
            identifier(section_id, "section_id")
            require(type(enabled) is bool, "enabled", "Expected boolean")
            require(type(expected_revision) is int and expected_revision == self.model["revision"], "revision", "Conflict: reload saved state; your unsaved changes are retained")
            section = next((s for s in self.model["schedules"] if s["id"] == section_id), None)
            if section is None:
                raise Invalid("section_id", "Unknown section")
            if section.get("enabled", True) == enabled:
                return self.public()
            # Finish logical progress under the old flag before the toggle. This
            # retains real occurrences in unrelated sections and avoids replay on enable.
            await self._advance(dt_util.utcnow(), skip_all_sources={section_id} if not enabled else frozenset())
            candidate = deepcopy(self.snapshot)
            section = next(s for s in candidate["model"]["schedules"] if s["id"] == section_id)
            section["enabled"] = enabled
            candidate["model"]["revision"] += 1
            runtime = candidate["runtime"]
            self._cancel_source_pending(candidate, section_id)
            for field in ("normal", "pre_away", "away_logical"):
                runtime[field] = {k: v for k, v in runtime[field].items() if v.get("source") != section_id}
            active = section_active(section, self.hass.config.time_zone, dt_util.utcnow(), self.solar)
            for member in section["entities"]:
                key = member["entity_key"]
                if not climate(candidate["model"], key) and (not enabled or not active):
                    continue
                endpoint = "start" if enabled and active else "end"
                normal = member_value(candidate["model"], member, endpoint)
                unit = member_unit(member, endpoint)
                self._normal(candidate, key, normal, section_id, control="enable" if enabled else "disable", **({"state_unit": unit} if unit is not None else {}))
                if away_for(candidate["model"], section) and not climate(candidate["model"], key):
                    runtime["sequence"] += 1
                    continue
                desired = member_value(candidate["model"], member, "end") if away_for(candidate["model"], section) else normal
                if climate(candidate["model"], key) and self._temperature_matches(candidate["model"], key, desired):
                    runtime["sequence"] += 1
                    continue
                self._desired(candidate, key, desired, section_id, unit, only_if_changed=climate(candidate["model"], key))
            await self._persist(candidate)
            self.generation += 1
            self._arm()
            self._notify()
            if defer_dispatch:
                self._queue_dispatch()
            else:
                await self._dispatch_committed()
            return self.public()

    def _apply_away(self, candidate, enabled, at):
        """Journal Away entry/exit without dispatch, shared by manual and timed paths."""
        runtime = candidate["runtime"]
        if enabled:
            runtime["pre_away"] = deepcopy(runtime["normal"])
            runtime["away_logical"] = {}
        candidate["model"]["away"] = enabled
        candidate["model"]["revision"] += 1
        candidate["model"].pop("away_until", None)
        for section in candidate["model"]["schedules"]:
            if section.get("away_enabled", True):
                self._cancel_source_pending(candidate, section["id"])
        affected = self._away_climate(candidate["model"])
        self._cancel_source_pending(candidate, "away", affected)
        if enabled:
            for key in affected:
                value = candidate["model"]["entity_settings"][key]["setback"]
                if not self._temperature_matches(candidate["model"], key, value):
                    self._desired(candidate, key, value, "away", only_if_changed=True)
        if not enabled:
            resumed = {}
            for section in candidate["model"]["schedules"]:
                if not section.get("away_enabled", True) or not section_active(section, self.hass.config.time_zone, at, self.solar):
                    continue
                for member in section["entities"]:
                    key = member["entity_key"]
                    unit = member_unit(member, "start")
                    resumed[key] = (member_value(candidate["model"], member, "start"), section["id"], unit)
            for key, (value, source, unit) in resumed.items():
                self._normal(candidate, key, value, source, control="away_exit", **({"state_unit": unit} if unit is not None else {}))
                if climate(candidate["model"], key) and self._temperature_matches(candidate["model"], key, value):
                    runtime["sequence"] += 1
                else:
                    self._desired(candidate, key, value, source, unit, only_if_changed=climate(candidate["model"], key))

    async def _expire_away(self, now):
        """Recover the expiry cutover before normal catch-up, including downtime."""
        deadline = self.model.get("away_until")
        if not self.model["away"] or not deadline or away_time(deadline) > now:
            return
        expiry = away_time(deadline)
        candidate = deepcopy(self.snapshot)
        runtime = candidate["runtime"]
        cursor = dt_util.parse_datetime(runtime["cursor"])
        if expiry > cursor:
            events = compile_events(candidate["model"], runtime["zone"], cursor, expiry, self.solar)
            self._record_events(candidate, events)
            runtime["cursor"] = expiry.isoformat()
        self._apply_away(candidate, False, expiry)
        cursor = dt_util.parse_datetime(runtime["cursor"])
        if now > cursor:
            events = compile_events(candidate["model"], runtime["zone"], cursor, now, self.solar)
            self._record_events(candidate, events)
            runtime["cursor"] = now.isoformat()
        for key, command in runtime["pending"].items():
            if climate(candidate["model"], key):
                command["only_if_changed"] = True
        await self._persist(candidate)
        self.generation += 1
        self._arm()
        self._notify()
        await self._drain()

    async def set_away(self, enabled, expected_revision=None, until=UNTIL_UNSET, defer_dispatch=False):
        async with self.lock:
            require(not self.closed, "manager", "Integration unloaded")
            require(type(enabled) is bool, "away", "Expected boolean")
            now = dt_util.utcnow()
            await self._expire_away(now)
            if expected_revision is not None:
                require(expected_revision == self.model["revision"], "revision", "Conflict: reload saved state")
            require(enabled or until is UNTIL_UNSET or until is None, "away_until", "A return time requires Away to be on")
            deadline = self.model.get("away_until") if enabled and until is UNTIL_UNSET else None
            if enabled and until is not UNTIL_UNSET and until is not None:
                deadline = away_time(until, self.hass.config.time_zone, now).isoformat()
            if enabled == self.model["away"]:
                if deadline == self.model.get("away_until"):
                    return self.public()
                candidate = deepcopy(self.snapshot)
                candidate["model"].pop("away_until", None)
                if deadline:
                    candidate["model"]["away_until"] = deadline
                candidate["model"]["revision"] += 1
                await self._persist(candidate)
                self.generation += 1
                self._arm()
                self._notify()
                return self.public()
            # Update logical progress to toggle instant before selecting exit values.
            suspended = {s["id"] for s in self.model["schedules"] if s.get("away_enabled", True)} if enabled else frozenset()
            await self._advance(now, skip_all_sources=suspended)
            candidate = deepcopy(self.snapshot)
            self._apply_away(candidate, enabled, dt_util.utcnow())
            if deadline:
                candidate["model"]["away_until"] = deadline
            await self._persist(candidate)
            self.generation += 1
            self._arm()
            self._notify()
            if defer_dispatch:
                self._queue_dispatch()
            else:
                await self._dispatch_committed()
            return self.public()

    @callback
    def _state_changed(self, event):
        eid = event.data.get("entity_id", "")
        if eid in self.entity_keys:
            old, new = event.data.get("old_state"), event.data.get("new_state")
            pending = self.snapshot["runtime"]["pending"]
            if (any(key in pending for key in self.entity_keys[eid]) or old is None or new is None or
                (old.state in ("unknown", "unavailable")) != (new.state in ("unknown", "unavailable")) or
                any(old.attributes.get(field) != new.attributes.get(field) for field in CAPABILITY_FIELDS)):
                self.hass.async_create_task(self._state_update(event))

    async def _state_update(self, event):
        async with self.lock:
            if self.closed:
                return
            eid = event.data["entity_id"]
            keys = self.entity_keys.get(eid, set())
            if not keys:
                return
            old, new = event.data.get("old_state"), event.data.get("new_state")
            recovered = new and new.state not in ("unknown", "unavailable") and (not old or old.state in ("unknown", "unavailable"))
            notify = False
            if recovered:
                await self._drain(keys)
                notify = True
            elif old and new and old.state not in ("unknown", "unavailable") and new.state not in ("unknown", "unavailable") and new.context.id not in self.command_contexts and (
                old.attributes.get("temperature") != new.attributes.get("temperature") if eid.startswith("climate.") else old.state != new.state
            ):
                candidate = deepcopy(self.snapshot)
                changed = False
                for key in keys:
                    pending = candidate["runtime"]["pending"].get(key)
                    if pending and pending.get("attempt_context") != new.context.id:
                        candidate["runtime"]["pending"].pop(key)
                        candidate["runtime"]["errors"].pop(key, None)
                        changed = True
                if changed:
                    await self._persist(candidate)
                    notify = True
            elif old and new and any(old.attributes.get(field) != new.attributes.get(field) for field in CAPABILITY_FIELDS):
                await self._drain(keys)
                notify = True
            if notify or (old and new and (old.state in ("unknown", "unavailable")) != (new.state in ("unknown", "unavailable"))) or new is None:
                self._notify()

    @callback
    def _service_registered(self, event):
        domain = event.data.get("domain")
        if domain in self.entity_domains:
            self.hass.async_create_task(self._service_recovery(domain))

    async def _service_recovery(self, domain):
        async with self.lock:
            if self.closed:
                return
            caps = self.capabilities({eid for eid in self.entity_keys if eid.split(".", 1)[0] == domain})
            keys = {key for key, setting in self.model["entity_settings"].items()
                    if setting["entity_id"].split(".", 1)[0] == domain and
                    caps.get(setting["entity_id"], {}).get("available") and caps.get(setting["entity_id"], {}).get("supported")}
            await self._drain(keys)
            self._notify()

    @callback
    def _registry_changed(self, event):
        if event.data.get("entity_id") in self.entity_keys or event.data.get("changes", {}).get("entity_id") in self.entity_keys:
            self.hass.async_create_task(self._refresh_environment())

    @callback
    def _location_changed(self, event):
        """Registry presentation changes do not alter runtime or scheduling order."""
        self._notify()

    @callback
    def _timezone_changed(self, event):
        self.hass.async_create_task(self._refresh_environment())

    async def _refresh_environment(self):
        async with self.lock:
            if self.closed:
                return
            candidate = deepcopy(self.snapshot)
            changed = False
            registry = er.async_get(self.hass)
            for setting in candidate["model"]["entity_settings"].values():
                entry = registry.async_get(setting["registry_id"]) if setting.get("registry_id") else None
                if entry and setting["entity_id"] != entry.entity_id:
                    old = setting["entity_id"]
                    setting["entity_id"] = entry.entity_id
                    cached = candidate["capabilities"].pop(old, None)
                    if cached:
                        candidate["capabilities"][entry.entity_id] = {**cached, "entity_id": entry.entity_id}
                    changed = True
            if candidate["runtime"]["zone"] != self.hass.config.time_zone:
                candidate["runtime"]["zone"] = self.hass.config.time_zone
                candidate["runtime"]["cursor"] = dt_util.utcnow().isoformat()
                changed = True
            if changed:
                candidate["model"]["revision"] += 1
                await self._persist(candidate)
                self.generation += 1
                self._arm()
                self._notify()
            else:
                self._arm()
                self._notify()
