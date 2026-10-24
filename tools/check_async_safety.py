"""Fresh-process loop-I/O audit using isolated HA and mocked services only."""

import asyncio
from copy import deepcopy
from datetime import timedelta
import logging
from pathlib import Path
import sys
import tempfile
import threading
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er

from custom_components.scheduling_manager.scheduler import Manager
from test_backend import MemoryStore, NOW, fixture


class LoopAudit(logging.Handler):
    """Catch native timezone reads too, which Python monkeypatches can miss."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.active = False
        self.loop_thread = threading.get_ident()
        self.violations = []
        self.cold_reads = []
        self.warnings = []

    def emit(self, record):
        if self.active and (
            record.name.startswith("custom_components.scheduling_manager")
            or "Detected blocking call" in record.getMessage()
        ):
            self.warnings.append(record.getMessage())

    def audit(self, event, args):
        if not self.active or event not in ("open", "os.listdir", "os.scandir"):
            return
        path = str(args[0])
        if event == "open" and ("/zoneinfo/" in path or "/astral/" in path):
            self.cold_reads.append((path, threading.get_ident()))
        if threading.get_ident() != self.loop_thread:
            return
        frame = sys._getframe(1)
        origin = None
        while frame:
            filename = frame.f_code.co_filename
            # HA inspects source context when checking callback/API usage. These
            # framework linecache reads are not integration runtime file I/O.
            if filename.endswith("/linecache.py"):
                return
            if "/custom_components/scheduling_manager/" in filename and origin is None:
                origin = (filename, frame.f_lineno)
            frame = frame.f_back
        if origin:
            self.violations.append((event, path, origin))


async def check(config_dir):
    hass = HomeAssistant(config_dir)
    hass.config.time_zone = "Pacific/Chatham"
    hass.config.latitude = -43.95
    hass.config.longitude = -176.55
    dr.async_setup(hass)
    await dr.async_load(hass, load_empty=True)
    await er.async_get(hass).async_load()
    calls = []

    async def climate(call):
        calls.append(deepcopy(call.data))

    hass.services.async_register("climate", "set_temperature", climate)
    hass.states.async_set("climate.kitchen", "heat", {
        "supported_features": 1, "min_temp": 7, "max_temp": 35,
        "target_temp_step": 0.5, "temperature": 20,
    })
    manager = Manager(hass)
    manager.store = MemoryStore()
    audit = LoopAudit()
    sys.addaudithook(audit.audit)
    logger = logging.getLogger()
    logger.addHandler(audit)
    assert "astral.sun" not in sys.modules, "Run this audit in a fresh Python process"
    audit.active = True
    try:
        clock = NOW
        with patch("custom_components.scheduling_manager.scheduler.dt_util.utcnow", side_effect=lambda: clock):
            await manager.start()
            assert manager.public()["timezone"] == "Pacific/Chatham"
            clock += timedelta(seconds=1)
            section, settings = fixture(start=0, end=1440, days=list(range(7)))
            section["sub_schedules"][0]["bands"][0]["one_off"] = True
            await manager.save_section(manager.model["revision"], "upsert", section["id"], section, settings)
            assert len(calls) == 1
            recurring, _ = fixture(key=next(iter(settings)), days=list(range(7)))
            recurring["sub_schedules"][0]["bands"][0].update(
                start_dynamic={"event": "sunrise", "offset": 0},
                end_dynamic={"event": "sunset", "offset": 0},
                enabled=False, disabled_until="2026-07-08T13:00",
            )
            await manager.save_section(manager.model["revision"], "upsert", recurring["id"], recurring)
            await manager.set_away(True, until="2026-07-08T13:00")
            manager.schedule_activity()
            manager.public()
            hass.config.time_zone = "Asia/Kathmandu"
            hass.bus.async_fire("core_config_updated", {"time_zone": hass.config.time_zone})
            await hass.async_block_till_done()
            assert manager.public()["timezone"] == "Asia/Kathmandu"
            assert manager._solar.zone is manager.zone
            manager.schedule_activity()
            await manager.stop()
    finally:
        audit.active = False
        logger.removeHandler(audit)
        await manager.stop()
        await hass.async_block_till_done()
        await hass.async_stop(force=True)
        hass.data.clear()
    assert not audit.violations, audit.violations
    assert not audit.warnings, audit.warnings
    for fragment in ("Pacific/Chatham", "Asia/Kathmandu", "/astral/"):
        reads = [thread for path, thread in audit.cold_reads if fragment in path]
        assert reads, f"Cold-load coverage missing for {fragment}"
        assert audit.loop_thread not in reads, f"Event-loop cold read for {fragment}"
    print("Cold timezone/solar setup, Save, public/activity, deadlines and timezone change: no loop I/O or integration warnings")


if __name__ == "__main__":
    ZoneInfo.clear_cache()
    with tempfile.TemporaryDirectory(prefix="scheduling-manager-async-") as temporary:
        asyncio.run(check(temporary), debug=True)
