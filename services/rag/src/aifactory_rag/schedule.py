"""A daily ingest of every active source, run by the service (RQ-0051).

Repository sources stay current through webhooks; a folder source on the file
server was read only when someone ran an ingest by hand. With
`rag.ingest.schedule` ("HH:MM") the API service triggers every enabled source
once a day at that hour, through the webhook queue so a source already being
ingested folds into one more run. The hour is read on the clock of
`rag.ingest.scheduleTimezone` (an IANA name), or the host's local clock.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta, tzinfo
from zoneinfo import ZoneInfo

from aifactory_rag.webhook import IngestQueue


def zone_of(name: str | None) -> tzinfo | None:
    """The zone a schedule is read in: None is the host's local time."""
    return ZoneInfo(name) if name else None


def next_run(now: datetime, at: str, zone: tzinfo | None) -> datetime:
    """The next occurrence of the wall-clock hour `at` ("HH:MM") in `zone`.

    Today's when it is still ahead, otherwise tomorrow's. Wall-clock time in
    the zone, so a DST change moves the run with the clock instead of drifting
    it by an hour. `now` must be aware."""
    hour, minute = (int(part) for part in at.split(":"))
    local = now.astimezone(zone) if zone else now.astimezone()
    candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= local:
        candidate = (candidate + timedelta(days=1)).replace(hour=hour, minute=minute)
    return candidate


class DailyIngest:
    """Triggers every enabled source once a day at the configured hour."""

    def __init__(
        self,
        at: str,
        zone_name: str | None,
        queue: IngestQueue,
        sources: Callable[[], Iterable[str]],
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.at = at
        self.zone_name = zone_name
        self.zone = zone_of(zone_name)
        self._queue = queue
        self._sources = sources
        self._clock = clock or (lambda: datetime.now(self.zone) if self.zone else datetime.now().astimezone())
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="scheduled-ingest", daemon=True)

    @property
    def started_by(self) -> str:
        return f"schedule {self.at}" + (f" {self.zone_name}" if self.zone_name else "")

    def next(self) -> datetime:
        return next_run(self._clock(), self.at, self.zone)

    def describe(self) -> dict[str, str]:
        return {"at": self.at, "timezone": self.zone_name or "local", "next": self.next().isoformat(timespec="minutes")}

    def start(self) -> DailyIngest:
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()

    def trigger_all(self) -> list[str]:
        """One run per enabled source, in the configured order; what was queued."""
        queued: list[str] = []
        for source_id in self._sources():
            self._queue.trigger(source_id, self.started_by)
            queued.append(source_id)
        return queued

    def _loop(self) -> None:
        while not self._stop.is_set():
            due = self.next()
            # In UTC: two datetimes in one zone subtract by the wall clock, an
            # hour off across a DST change.
            wait = (due.astimezone(UTC) - self._clock().astimezone(UTC)).total_seconds()
            if self._stop.wait(max(wait, 0.0)):
                return
            queued = self.trigger_all()
            print(f"Scheduled ingest ({self.started_by}): {', '.join(queued) or 'no active source'}", flush=True)
