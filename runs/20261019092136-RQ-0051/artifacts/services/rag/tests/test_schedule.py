"""The daily ingest of every active source the service runs (RQ-0051)."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from aifactory_rag.schedule import DailyIngest, next_run, zone_of
from aifactory_rag.webhook import IngestQueue

ISTANBUL = ZoneInfo("Europe/Istanbul")
BERLIN = ZoneInfo("Europe/Berlin")


class NextRunTests(unittest.TestCase):
    def test_later_today_when_the_hour_is_ahead(self) -> None:
        now = datetime(2026, 10, 19, 12, 20, tzinfo=UTC)  # 15:20 Istanbul
        due = next_run(now, "18:00", ISTANBUL)
        self.assertEqual(due.isoformat(), "2026-10-19T18:00:00+03:00")

    def test_tomorrow_when_the_hour_has_passed(self) -> None:
        now = datetime(2026, 10, 19, 12, 20, tzinfo=UTC)  # 15:20 Istanbul
        due = next_run(now, "02:00", ISTANBUL)
        self.assertEqual(due.isoformat(), "2026-10-20T02:00:00+03:00")
        self.assertEqual(due.astimezone(UTC).isoformat(), "2026-10-19T23:00:00+00:00")

    def test_the_hour_follows_the_wall_clock_across_a_dst_change(self) -> None:
        # Berlin leaves summer time on 25 October 2026 at 03:00 -> 02:00.
        now = datetime(2026, 10, 24, 10, 0, tzinfo=BERLIN)
        first = next_run(now, "04:00", BERLIN)
        second = next_run(first, "04:00", BERLIN)
        self.assertEqual(first.isoformat(), "2026-10-25T04:00:00+01:00")
        self.assertEqual(second.isoformat(), "2026-10-26T04:00:00+01:00")
        utc = lambda value: value.astimezone(UTC)
        self.assertEqual((utc(second) - utc(first)).total_seconds(), 24 * 3600)
        # 24 Oct 10:00 CEST (08:00 UTC) to 25 Oct 04:00 CET (03:00 UTC): 19 hours, the extra hour counted.
        self.assertEqual((utc(first) - utc(now)).total_seconds(), 19 * 3600)

    def test_the_host_clock_when_no_zone(self) -> None:
        self.assertIsNone(zone_of(None))
        self.assertIsNone(zone_of(""))
        now = datetime.now().astimezone()
        due = next_run(now, "23:59", None)
        self.assertGreater(due, now)
        self.assertLessEqual((due - now).total_seconds(), 24 * 3600)


class DailyIngestTests(unittest.TestCase):
    def test_every_enabled_source_is_triggered_once_as_schedule(self) -> None:
        calls: list[tuple[str, str | None]] = []
        queue = IngestQueue(lambda source_id, who: None)
        queue.trigger = lambda source_id, started_by=None: calls.append((source_id, started_by)) or "started"  # type: ignore[method-assign]
        daily = DailyIngest("02:00", "Europe/Istanbul", queue, lambda: ["arinc", "simics"],
                            clock=lambda: datetime(2026, 10, 19, 12, 0, tzinfo=UTC))
        self.assertEqual(daily.trigger_all(), ["arinc", "simics"])
        self.assertEqual(calls, [("arinc", "schedule 02:00 Europe/Istanbul"), ("simics", "schedule 02:00 Europe/Istanbul")])
        self.assertEqual(daily.describe(), {"at": "02:00", "timezone": "Europe/Istanbul", "next": "2026-10-20T02:00+03:00"})

    def test_the_loop_fires_when_the_hour_comes_and_stops(self) -> None:
        calls: list[str] = []
        queue = IngestQueue(lambda source_id, who: None)
        queue.trigger = lambda source_id, started_by=None: calls.append(source_id) or "started"  # type: ignore[method-assign]
        ticks = iter([
            datetime(2026, 10, 19, 1, 59, 59, 900000, tzinfo=ISTANBUL),  # next(): due in 0.1 s
            datetime(2026, 10, 19, 1, 59, 59, 900000, tzinfo=ISTANBUL),  # the wait
            datetime(2026, 10, 19, 2, 0, 1, tzinfo=ISTANBUL),            # after firing: next is tomorrow
            datetime(2026, 10, 19, 2, 0, 1, tzinfo=ISTANBUL),
        ])
        daily = DailyIngest("02:00", "Europe/Istanbul", queue, lambda: ["renode"], clock=lambda: next(ticks))
        daily.start()
        daily._thread.join(timeout=2.0)
        daily.stop()
        self.assertEqual(calls, ["renode"])


if __name__ == "__main__":
    unittest.main()
