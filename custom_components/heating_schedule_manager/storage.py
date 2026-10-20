"""Read-only corruption guard before HA Store load; Store owns all writes."""
import json
from pathlib import Path
from .validation import require
from .const import VERSION


def inspect_store(path):
    try:
        content = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return
    # HA Store normally renames invalid JSON and treats it as empty. The manager
    # instead refuses setup before that recovery path can touch the original.
    envelope = json.loads(content)
    require(isinstance(envelope, dict) and isinstance(envelope.get("data"), dict), "storage", "Malformed schedule storage envelope; restore from backup")
    require(type(envelope.get("version")) is int, "storage", "Missing storage version")
    require(envelope["version"] == VERSION and envelope.get("minor_version", 1) == 1,
            "storage", "Unsupported storage envelope version; original preserved")
