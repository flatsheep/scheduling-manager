"""Per-band suspension, evaluated at each real endpoint instant."""
from .validation import away_time


def band_disabled(band, instant):
    """A timed suspension ends at its absolute deadline."""
    return not band.get("enabled", True) and (
        not band.get("disabled_until") or instant < away_time(band["disabled_until"])
    )
