"""Prevent spurious manual adjustments in the observed home scenarios."""

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import unittest

# Load just the independent policy, so these cases work without a running HA.
spec = importlib.util.spec_from_file_location(
    "heatdial_engine",
    Path(__file__).resolve().parents[1] / "custom_components" / "heatdial" / "engine.py",
)
engine = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = engine
spec.loader.exec_module(engine)

LOCAL = timezone(timedelta(hours=3))


class HeatDialTests(unittest.TestCase):
    def check(
        self, *, hour=15, dial=2, kitchen=24.4, grandma=24.6, parents=24.3,
        decline=0, weather=None, last_change=None, history_gap=False,
        short_dip=False, settings=None,
    ):
        now = datetime(2026, 11, 24, hour, 30, tzinfo=LOCAL)
        current = now.timestamp()
        history = []
        for minutes in range(270, -1, -5):
            if history_gap and 5 < minutes < 120:
                continue
            past = min(minutes / 120, 1) * decline
            temp = kitchen + past if kitchen is not None else None
            if short_dip and minutes >= 15:
                temp += 0.9
            values = {"kitchen": temp, "grandma": grandma, "parents": parents}
            history.append(engine.Reading(
                current - minutes * 60, dial, 3.0,
                {key: value for key, value in values.items() if value is not None},
            ))
        return engine.decide(
            settings or engine.Settings(), now, engine.continuous(history),
            ["kitchen", "grandma"], ["parents"], weather or engine.Weather(outdoor=3),
            current - last_change if last_change is not None else None,
        )

    def test_hold_on_three_when_rooms_are_comfortable(self):
        advice = self.check(dial=3)
        self.assertEqual((advice.action, advice.recommended), ("hold", 3))

    def test_legacy_room_weights_and_monitor_only_rooms(self):
        self.assertEqual(engine.room_weights("", ["a"], ["b"]), {"a": 1, "b": 0.5})
        weights = engine.room_weights('{"a": 1.5, "b": 0, "c": 0.2}', ["a"], ["b", "c"])
        self.assertEqual(engine.room_groups(weights), (("a",), ("c",)))
        self.assertEqual(engine.room_groups({"a": 0.3, "b": 0.5}), (("b",), ("a",)))
        with self.assertRaises(ValueError):
            engine.room_weights('{"a": 0}', ["a"], [])

    def test_higher_weight_responds_to_cooling_sooner(self):
        now = datetime(2026, 11, 24, 15, 0, tzinfo=LOCAL)
        end = now.timestamp()
        history = [
            engine.Reading(end - elapsed * 60, 2, 3, {"room": 22.8 if elapsed <= 35 else 23.3})
            for elapsed in range(180, -1, -5)
        ]
        for weight, expected in [(1.0, "hold"), (2.0, "raise")]:
            result = engine.decide(
                engine.Settings(), now, history, ["room"], [], engine.Weather(3), None,
                {"room": weight},
            )
            self.assertEqual(result.action, expected)

    def test_observed_evening_cooling_can_raise_before_rooms_are_cold(self):
        advice = self.check(
            hour=20, kitchen=23.8, grandma=24.7, decline=0.25,
            weather=engine.Weather(1.2, -2.5, 0.5, 0.7),
        )
        self.assertEqual((advice.reason, advice.recommended), ("overnight_cold", 3))

    def test_rebound_and_stable_rooms_do_not_raise(self):
        advice = self.check(hour=20, weather=engine.Weather(7, -2.0, 3.7, 8))
        self.assertEqual((advice.action, advice.recommended), ("hold", 2))

    def test_severe_sustained_forecast_triggers_before_bed(self):
        advice = self.check(hour=20, weather=engine.Weather(5, 0, -12, -9))
        self.assertEqual((advice.action, advice.recommended), ("raise", 3))

    def test_brief_dawn_dip_above_night_minimum_does_not_raise(self):
        advice = self.check(hour=6, kitchen=22.7, grandma=22.8)
        self.assertEqual((advice.action, advice.recommended), ("hold", 2))

    def test_lower_with_sustained_overheating_and_weather_margin(self):
        advice = self.check(dial=3, kitchen=25.3, grandma=24.6, parents=24)
        self.assertEqual((advice.reason, advice.recommended), ("room_hot", 2))

    def test_no_lowering_outside_reduction_window(self):
        advice = self.check(hour=19, dial=3, kitchen=25.3, grandma=24.6)
        self.assertEqual((advice.action, advice.recommended), ("hold", 3))

    def test_abrupt_isolated_drop_and_settling_pause_advice(self):
        self.assertEqual(self.check(kitchen=21.8, short_dip=True).reason, "airing")
        self.assertEqual(self.check(kitchen=21.8, last_change=1800).reason, "settling")

    def test_forecast_loss_does_not_block_response_to_sustained_cold(self):
        advice = self.check(kitchen=22.1, weather=engine.Weather())
        self.assertEqual((advice.reason, advice.recommended), ("room_cold", 3))

    def test_conflicting_rooms_or_missing_primary_cannot_trigger_a_step(self):
        self.assertEqual(self.check(kitchen=22.1, grandma=25.1).reason, "room_conflict")
        self.assertEqual(self.check(kitchen=None).reason, "room_unavailable")

    def test_gap_does_not_count_toward_persistence(self):
        self.assertEqual(self.check(kitchen=21.8, history_gap=True).reason, "collecting")

    def test_existing_recorder_history_can_skip_initial_wait(self):
        now = datetime(2026, 11, 24, 15, 0, tzinfo=LOCAL)
        end = now.timestamp()
        series = {
            "dial": [(end - 5 * 3600, 2)],
            "out": [(end - 1800, 3)],
            "a": [(end - 1800, 24.2)],
            "b": [(end - 1800, 24.5)],
        }
        history, dial = engine.recorded_readings(end, 300, 5400, "dial", "out", ("a", "b"), series, 3)
        self.assertEqual(dial, (2, end - 5 * 3600))
        current = engine.Reading(end, 2, 3, {"a": 24.2, "b": 24.5})
        result = engine.decide(engine.Settings(), now, [*history, current], ["a", "b"], [],
                               engine.Weather(3), dial[1])
        self.assertEqual(result.reason, "within_range")

    def test_absent_or_stale_recorder_readings_do_not_count_as_room_history(self):
        now = datetime(2026, 11, 24, 15, 0, tzinfo=LOCAL)
        end = now.timestamp()
        series = {"a": [(end - 6000, 22.8)], "b": [(end - 1200, 24.5)]}
        history, dial = engine.recorded_readings(end, 300, 5400, "dial", "out", ("a", "b"), series, 3)
        self.assertIsNone(dial)
        self.assertNotIn("a", history[-1].rooms)
        current = engine.Reading(end, 2, None, {"a": 22.8, "b": 24.5})
        result = engine.decide(engine.Settings(), now, [*history, current], ["a", "b"], [],
                               engine.Weather(), None)
        self.assertEqual(result.reason, "collecting")

    def test_limited_scale(self):
        advice = self.check(kitchen=22.1, settings=engine.Settings(max_dial=2))
        self.assertEqual((advice.reason, advice.recommended), ("dial_limit", 2))
        self.assertIsNone(engine.dial_position(2.5, 3))
        self.assertIsNone(engine.dial_position("nan", 3))

    def test_scale_allows_positions_above_the_old_verified_limit(self):
        scale = engine.resolve_scale("40;47;56;63;70;77", 6)
        self.assertEqual(scale, (40, 47, 56, 63, 70, 77))
        advice = self.check(dial=3, kitchen=22.1, settings=engine.Settings(max_dial=len(scale)))
        self.assertEqual((advice.action, advice.recommended), ("raise", 4))

    def test_scale_accepts_missing_and_decimal_temperatures(self):
        self.assertEqual(engine.parse_scale("40;-;56,5"), (40, None, 56.5))
        self.assertEqual(engine.resolve_scale("", 4), (None,) * 4)
        self.assertEqual(engine.resolve_scale("40;47;56", 2), (40, 47))
        for invalid in ("47;40", "nan", "101", "40;40"):
            with self.assertRaises(ValueError):
                engine.parse_scale(invalid)

    def test_short_step_request_stays_out_of_the_recommendation(self):
        step = engine.Advice("raise", "overnight_cold", 2, 3)
        advice, pending = engine.confirm_advice(step, None, 0)
        self.assertEqual((advice.reason, advice.recommended), ("confirming", 2))
        advice, pending = engine.confirm_advice(step, pending, 15 * 60)
        self.assertEqual(advice.recommended, 2)
        hold = engine.Advice("hold", "within_range", 2, 2)
        self.assertEqual(engine.confirm_advice(hold, pending, 16 * 60), (hold, None))
        advice, pending = engine.confirm_advice(step, pending, 20 * 60)
        self.assertEqual(advice, step)

    def test_forecast_bias_is_anchored_to_outdoor_sensor(self):
        history = [engine.Reading(0, 2, 1.2, {})]
        forecast = [engine.Point(hour * 3600, 3.0) for hour in (1, 2, 3, 4)]
        weather = engine.weather_signal(history, forecast, 4.2, 4 * 3600)
        self.assertAlmostEqual(weather.low, 0.75)
        self.assertAlmostEqual(weather.end, 1.5)
        self.assertIsNone(engine.weather_signal(history, forecast[2:], 4.2, 14400).low)
