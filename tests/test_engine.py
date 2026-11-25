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

    def test_limited_scale(self):
        advice = self.check(kitchen=22.1, settings=engine.Settings(max_dial=2))
        self.assertEqual((advice.reason, advice.recommended), ("dial_limit", 2))
        self.assertIsNone(engine.dial_position(2.5, 3))
        self.assertIsNone(engine.dial_position("nan", 3))

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
