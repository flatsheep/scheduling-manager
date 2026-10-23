"""Advertised state choices backed by real HA entity actions, never state injection."""
from datetime import date, datetime, time
from decimal import Decimal
import math
import re

from homeassistant.components.alarm_control_panel import AlarmControlPanelEntityFeature as Alarm
from homeassistant.components.cover import CoverEntityFeature as Cover
from homeassistant.components.fan import FanEntityFeature as Fan
from homeassistant.components.lawn_mower import LawnMowerEntityFeature as Mower
from homeassistant.components.media_player import MediaPlayerEntityFeature as Media
from homeassistant.components.siren import SirenEntityFeature as Siren
from homeassistant.components.valve import ValveEntityFeature as Valve
from homeassistant.components.vacuum import VacuumEntityFeature as Vacuum
from homeassistant.components.water_heater import WaterHeaterEntityFeature as Heater
from homeassistant.helpers import entity_registry as er
from .const import DOMAIN


BINARY_DOMAINS = {"light", "switch", "input_boolean", "automation", "script", "remote", "humidifier"}
FEATURE_ACTIONS = {
    "fan": [("on", "turn_on", Fan.TURN_ON), ("off", "turn_off", Fan.TURN_OFF)],
    "siren": [("on", "turn_on", Siren.TURN_ON), ("off", "turn_off", Siren.TURN_OFF)],
    "cover": [("open", "open_cover", Cover.OPEN), ("closed", "close_cover", Cover.CLOSE)],
    "valve": [("open", "open_valve", Valve.OPEN), ("closed", "close_valve", Valve.CLOSE)],
    "vacuum": [("cleaning", "start", Vacuum.START), ("docked", "return_to_base", Vacuum.RETURN_HOME),
               ("idle", "stop", Vacuum.STOP), ("paused", "pause", Vacuum.PAUSE)],
    "lawn_mower": [("mowing", "start_mowing", Mower.START_MOWING), ("docked", "dock", Mower.DOCK), ("paused", "pause", Mower.PAUSE)],
    "media_player": [("playing", "media_play", Media.PLAY), ("paused", "media_pause", Media.PAUSE),
                     ("idle", "media_stop", Media.STOP), ("off", "turn_off", Media.TURN_OFF)],
    "alarm_control_panel": [("armed_home", "alarm_arm_home", Alarm.ARM_HOME),
                            ("armed_away", "alarm_arm_away", Alarm.ARM_AWAY),
                            ("armed_night", "alarm_arm_night", Alarm.ARM_NIGHT),
                            ("armed_vacation", "alarm_arm_vacation", Alarm.ARM_VACATION),
                            ("armed_custom_bypass", "alarm_arm_custom_bypass", Alarm.ARM_CUSTOM_BYPASS)],
}
VALUE_DOMAINS = {"number", "input_number", "text", "input_text", "select", "input_select", "date", "time", "datetime", "input_datetime"}
WRITABLE_DOMAINS = BINARY_DOMAINS | set(FEATURE_ACTIONS) | VALUE_DOMAINS | {"lock", "water_heater", "timer", "group"}


def manager_control(hass, entity_id):
    entry = er.async_get(hass).async_get(entity_id)
    return entry is not None and entry.platform == DOMAIN


def options(value):
    return list(value) if isinstance(value, (list, tuple)) and all(isinstance(item, str) for item in value) else []


def state_capability(hass, state):
    domain = state.domain
    attrs = state.attributes
    features = int(attrs.get("supported_features") or 0)
    has = lambda service: hass.services.has_service(domain, service)
    cap = {"kind": "state", "options": [], "actions": {}, "current": state.state}
    actions = {}
    if domain in BINARY_DOMAINS:
        actions = {value: service for value, service in (("on", "turn_on"), ("off", "turn_off")) if has(service)}
    elif domain == "timer":
        actions = {value: service for value, service in (("active", "start"), ("paused", "pause"), ("idle", "cancel")) if has(service)}
    elif domain == "group":
        members = [hass.states.get(eid) for eid in attrs.get("entity_id", [])]
        binary = BINARY_DOMAINS | {"fan", "siren"}
        if members and all(member and not manager_control(hass, member.entity_id) and member.domain in binary and {"on", "off"}.issubset(state_capability(hass, member)["options"]) for member in members):
            actions = {value: service for value, service in (("on", "turn_on"), ("off", "turn_off")) if hass.services.has_service("homeassistant", service)}
            cap["service_domain"] = "homeassistant"
    elif domain == "lock":
        actions = {value: service for value, service in (("locked", "lock"), ("unlocked", "unlock")) if has(service)}
    elif domain in FEATURE_ACTIONS:
        if domain != "alarm_control_panel" or not (attrs.get("code_arm_required", True) and attrs.get("code_format")):
            actions = {value: service for value, service, feature in FEATURE_ACTIONS[domain] if features & feature and has(service)}
        if domain == "alarm_control_panel" and not attrs.get("code_format") and has("alarm_disarm"):
            actions["disarmed"] = "alarm_disarm"
    elif domain in ("select", "input_select") and has("select_option"):
        cap.update(options=options(attrs.get("options")), service="select_option", field="option")
    elif domain == "water_heater" and features & Heater.OPERATION_MODE and has("set_operation_mode"):
        cap.update(options=options(attrs.get("operation_list")), service="set_operation_mode", field="operation_mode")
    elif domain in ("number", "input_number") and has("set_value"):
        cap.update(kind="number", min=attrs.get("min", 0), max=attrs.get("max", 100), step=attrs.get("step", 1),
                   unit=attrs.get("unit_of_measurement", ""), service="set_value", field="value")
        try:
            cap["current"] = float(state.state)
            if not math.isfinite(cap["current"]):
                cap["current"] = None
        except ValueError:
            cap["current"] = None
    elif domain in ("text", "input_text") and has("set_value"):
        cap.update(kind="text", min_length=attrs.get("min", 0), max_length=attrs.get("max", 255),
                   pattern=attrs.get("pattern"), service="set_value", field="value")
    elif domain in ("date", "time", "datetime") and has("set_value"):
        cap.update(kind=domain, service="set_value", field=domain)
    elif domain == "input_datetime" and has("set_datetime"):
        kind = "datetime" if attrs.get("has_date") and attrs.get("has_time") else "date" if attrs.get("has_date") else "time"
        cap.update(kind=kind, service="set_datetime", field=kind)
    if actions:
        cap.update(actions=actions, options=list(actions))
    cap["supported"] = bool(cap["options"] or cap.get("service") and cap["kind"] != "state")
    if cap["kind"] == "number":
        try:
            cap["supported"] = all(Decimal(str(cap[k])).is_finite() for k in ("min", "max", "step")) and cap["step"] > 0 and cap["min"] <= cap["max"]
        except (ArithmeticError, TypeError):
            cap["supported"] = False
    cap["reason"] = None if cap["supported"] else "No advertised state-setting action is available (or a code is required)"
    return cap


def state_value(value, cap, path="state"):
    # Import here to keep validation and adapter metadata independent at import time.
    from .validation import number, require
    require(cap and cap.get("supported"), path, "Entity has no supported state-setting action")
    kind = cap.get("kind", "state")
    if kind == "state":
        require(isinstance(value, str) and value in cap["options"], path, "Choose one of the entity's available states")
    elif kind == "number":
        decimal = number(value, path)
        low, high, step = (Decimal(str(cap[k])) for k in ("min", "max", "step"))
        require(low <= decimal <= high and step > 0 and (decimal-low) % step == 0, path, "Value must follow the entity's limits and increments")
    else:
        require(isinstance(value, str), path, "Expected a state value")
        if kind == "text":
            require(cap.get("min_length", 0) <= len(value) <= cap.get("max_length", 255), path, "Text length is outside the supported limits")
            try:
                require(not cap.get("pattern") or re.fullmatch(cap["pattern"], value) is not None, path, "Text does not match the entity's pattern")
            except re.error:
                require(False, path, "Entity advertises an invalid text pattern")
        else:
            try:
                {"date": date.fromisoformat, "time": time.fromisoformat, "datetime": datetime.fromisoformat}[kind](value)
            except (ValueError, KeyError):
                require(False, path, "Choose a valid date/time state")
    return value


def state_action(value, cap, path="state"):
    value = state_value(value, cap, path)
    if cap.get("actions"):
        return cap["actions"][value], {}
    return cap["service"], {cap["field"]: value}
