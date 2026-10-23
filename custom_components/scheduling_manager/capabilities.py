"""Read writable entity capabilities; one bad advertisement cannot block others."""
from decimal import Decimal

from homeassistant.components.climate.const import ClimateEntityFeature
from homeassistant.helpers import entity_registry as er

from .actions import WRITABLE_DOMAINS, state_capability, manager_control


def cache_valid(current, cached, entity_ids=None):
    """Keep last supported metadata, without unrelated live current values."""
    result = {**cached, **{eid: cap for eid, cap in current.items() if cap["supported"]}}
    return {eid: {key: value for key, value in cap.items() if key != "current"} for eid, cap in result.items()
            if entity_ids is None or eid in entity_ids}


def _one(hass, state, registry):
    attrs = state.attributes
    entry = registry.async_get(state.entity_id)
    identity = {"entity_id": state.entity_id, "registry_id": entry.id if entry else None,
                "name": attrs.get("friendly_name") or state.entity_id, "available": True}
    if state.domain != "climate":
        return {**identity, **state_capability(hass, state)}
    unit = str(hass.config.units.temperature_unit)
    # ClimateEntity advertises no universal target step. HA's applicable default
    # display precision is tenths Celsius, whole Fahrenheit (verified 2026.7).
    step = attrs.get("target_temp_step") or (0.1 if unit == "°C" else 1)
    single = bool((attrs.get("supported_features") or 0) & ClimateEntityFeature.TARGET_TEMPERATURE)
    cap = {**identity, "kind": "climate", "unit": unit,
           "min": attrs.get("min_temp", 7 if unit == "°C" else 45),
           "max": attrs.get("max_temp", 35 if unit == "°C" else 95),
           "step": step, "current": attrs.get("temperature"), "supported": single,
           "reason": None if single else "Range-only or no single target temperature support"}
    low, high, increment = (Decimal(str(cap[k])) for k in ("min", "max", "step"))
    if not all(value.is_finite() for value in (low, high, increment)) or increment <= 0 or low > high:
        raise ValueError("Invalid temperature limits/increments")
    return cap


def read_capabilities(hass, cached, entity_ids=None):
    """Full discovery for the editor, direct state lookups for scheduled work."""
    result = {eid: {**cap, "available": False} for eid, cap in cached.items()
              if entity_ids is None or eid in entity_ids}
    registry = er.async_get(hass)
    states = hass.states.async_all() if entity_ids is None else (hass.states.get(eid) for eid in entity_ids)
    for state in states:
        if state is None:
            continue
        if state.domain != "climate" and state.domain not in WRITABLE_DOMAINS:
            continue
        if manager_control(hass, state.entity_id) or state.state in ("unavailable", "unknown"):
            continue
        try:
            result[state.entity_id] = _one(hass, state, registry)
        except (ArithmeticError, TypeError, ValueError) as err:
            result[state.entity_id] = {**cached.get(state.entity_id, {}), "entity_id": state.entity_id,
                "name": state.attributes.get("friendly_name") or state.entity_id,
                "available": True, "supported": False, "reason": f"Invalid entity capabilities: {err}"}
    return result
