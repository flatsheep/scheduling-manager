"""Synthetic HA benchmark: temporary config, mocked services, no live devices.

Run inside an isolated HA release container with a read-only project mount:
  python tools/benchmark_scheduler.py
"""
import asyncio
from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

from homeassistant.const import __version__
from homeassistant.helpers.storage import Store
from test_backend import IntegrationTests, fixture, NOW
from custom_components.scheduling_manager.capabilities import cache_valid
from custom_components.scheduling_manager.events import compile_events
from custom_components.scheduling_manager.validation import validate


def median_ms(action, iterations=20):
    samples = []
    for _ in range(iterations):
        start = time.perf_counter()
        action()
        samples.append((time.perf_counter() - start) * 1000)
    return round(statistics.median(samples), 3)


async def benchmark(size):
    harness = IntegrationTests("test_transition_last_wins_manual_and_temperature_only")
    await harness.asyncSetUp()
    try:
        for index in range(1000):
            harness.hass.states.async_set(f"sensor.benchmark_{index}", "1")
        for index in range(300):
            harness.set_state(f"climate.benchmark_{index}")
        await harness.hass.async_block_till_done()
        model = {"revision": 1, "away": False, "entity_settings": {}, "schedules": []}
        for index in range(size):
            section, settings = fixture(days=list(range(7)))
            settings[next(iter(settings))]["entity_id"] = f"climate.benchmark_{index}"
            model["entity_settings"].update(settings)
            model["schedules"].append(section)
        caps = harness.manager.capabilities()
        harness.manager.snapshot["model"] = validate(model, caps)
        entity_ids = {setting["entity_id"] for setting in model["entity_settings"].values()}
        harness.manager.snapshot["capabilities"] = cache_valid(caps, {}, entity_ids)
        harness.manager._reindex()
        row = {
            "schedules": size,
            "ha_states": len(harness.hass.states.async_all()),
            "cached_entities": len(harness.manager.snapshot["capabilities"]),
            "snapshot_bytes": len(json.dumps(harness.manager.snapshot)),
            "editor_full_discovery_ms": median_ms(harness.manager.capabilities),
            "snapshot_copy_ms": median_ms(lambda: deepcopy(harness.manager.snapshot)),
            "compile_8_days_ms": median_ms(lambda: compile_events(model, "UTC", NOW, NOW + timedelta(days=8))),
            "compile_26_year_downtime_ms": median_ms(lambda: compile_events(model, "UTC", NOW.replace(year=2000), NOW)),
            "public_warm_ms": median_ms(harness.manager.public),
        }
        counts = {"writes": 0, "full_capability_scans": 0, "targeted_entity_reads": 0}
        original_save = harness.store.async_save
        original_caps = harness.manager.capabilities

        async def save(data):
            counts["writes"] += 1
            await original_save(data)

        def capabilities(entity_ids=None):
            if entity_ids is None:
                counts["full_capability_scans"] += 1
            else:
                counts["targeted_entity_reads"] += len(entity_ids)
            return original_caps(entity_ids)

        harness.store.async_save = save
        harness.manager.capabilities = capabilities
        harness.clock = NOW.replace(hour=11)
        start = time.perf_counter()
        await harness.manager.tick()
        row["quiet_tick_ms"] = round((time.perf_counter() - start) * 1000, 3)
        row["quiet_tick_counts"] = dict(counts)
        counts.update(writes=0, full_capability_scans=0, targeted_entity_reads=0)
        harness.clock = NOW.replace(hour=12)
        start = time.perf_counter()
        await harness.manager.tick()
        row["simultaneous_dispatch_ms_memory_store"] = round((time.perf_counter() - start) * 1000, 3)
        row["dispatch_counts"] = dict(counts)
        row["mock_service_calls"] = len(harness.calls)
        store = Store(harness.hass, 1, "benchmark_only")
        samples = []
        for _ in range(5):
            start = time.perf_counter()
            await store.async_save(harness.manager.snapshot)
            samples.append((time.perf_counter() - start) * 1000)
        row["real_store_save_ms_median"] = round(statistics.median(samples), 3)
        row["real_store_save_ms_samples"] = [round(sample, 3) for sample in samples]
        return row
    finally:
        await harness.asyncTearDown()


async def main():
    results = [await benchmark(size) for size in (2, 20, 100)]
    print(json.dumps({"ha_version": __version__, "benchmarks": results}, indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
