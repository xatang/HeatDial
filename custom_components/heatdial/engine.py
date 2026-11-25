"""Decide when a manual boiler adjustment is worthwhile."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from math import isfinite
from statistics import median

MINUTE = 60
HOUR = 60 * MINUTE
MAX_GAP = 12 * MINUTE
HISTORY_SECONDS = 5 * HOUR
SETTLE_SECONDS = 3 * HOUR
CONFIRM_SECONDS = 20 * MINUTE


@dataclass(frozen=True)
class Reading:
    time: float
    dial: int | None
    outdoor: float | None
    rooms: dict[str, float]


@dataclass(frozen=True)
class Point:
    time: float
    temperature: float


@dataclass(frozen=True)
class Settings:
    day_min: float = 23.0
    day_max: float = 25.0
    night_min: float = 21.5
    day_start: int = 8
    day_end: int = 22
    lower_from: int = 9
    lower_until: int = 19
    evening_from: int = 20
    evening_until: int = 22
    max_dial: int = 3


@dataclass(frozen=True)
class Weather:
    outdoor: float | None = None
    recent_change: float | None = None
    low: float | None = None
    end: float | None = None

    @property
    def drop(self) -> float | None:
        if self.low is None or self.outdoor is None:
            return None
        return self.outdoor - self.low

    @property
    def rebounds(self) -> bool:
        return (
            self.end is not None and self.outdoor is not None
            and self.end >= self.outdoor + 0.5
        )


@dataclass(frozen=True)
class Room:
    entity_id: str
    temperature: float
    delta: float | None
    airing: bool
    trend_hours: int = 2


@dataclass(frozen=True)
class Advice:
    action: str
    reason: str
    dial: int | None
    recommended: int | None
    room: Room | None = None


def confirm_advice(
    advice: Advice, pending: tuple[int, float] | None, timestamp: float
) -> tuple[Advice, tuple[int, float] | None]:
    """Show a dial change only after a continuously matching recommendation."""
    if advice.action not in {"raise", "lower"} or advice.recommended is None:
        return advice, None
    if pending is None or pending[0] != advice.recommended:
        pending = (advice.recommended, timestamp)
    if timestamp - pending[1] >= CONFIRM_SECONDS:
        return advice, pending
    return replace(advice, action="hold", reason="confirming", recommended=advice.dial), pending


def number(value: object) -> float | None:
    """Parse a finite numeric state."""
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if isfinite(parsed) else None


def dial_position(value: object, maximum: int) -> int | None:
    """Accept an exact position, including integer-valued HA number helpers."""
    parsed = number(value)
    if parsed is not None and parsed.is_integer() and 1 <= parsed <= maximum:
        return int(parsed)
    return None


def continuous(history: Sequence[Reading]) -> list[Reading]:
    """Use only consecutive readings, so downtime cannot confirm a condition."""
    for index in range(len(history) - 1, 0, -1):
        if history[index].time - history[index - 1].time > MAX_GAP:
            return list(history[index:])
    return list(history)


def recorded_readings(
    end: float, step: int, max_age: float, dial_id: str, outdoor_id: str,
    room_ids: Sequence[str], series: dict[str, list[tuple[float, float | None]]],
    maximum: int,
) -> tuple[list[Reading], tuple[int, float] | None]:
    """Carry recorded states forward onto the controller's sample grid."""
    samples = []
    positions = dict.fromkeys(series, 0)
    states: dict[str, tuple[float, float | None]] = {}
    for offset in range(HISTORY_SECONDS, 0, -step):
        timestamp = end - offset
        for key, points in series.items():
            position = positions[key]
            while position < len(points) and points[position][0] <= timestamp:
                states[key] = points[position]
                position += 1
            positions[key] = position

        def recent(key: str) -> float | None:
            point = states.get(key)
            return point[1] if point is not None and timestamp - point[0] <= max_age else None

        room_values = {key: value for key in room_ids if (value := recent(key)) is not None}
        dial = dial_position(states.get(dial_id, (0, None))[1], maximum)
        samples.append(Reading(timestamp, dial, recent(outdoor_id), room_values))

    last_dial = None
    for timestamp, raw in series.get(dial_id, []):
        dial = dial_position(raw, maximum)
        if dial is not None and (last_dial is None or dial != last_dial[0]):
            last_dial = (dial, timestamp)
    return samples, last_dial


def _reference(
    history: Sequence[Reading], age: int, sample_value: Callable[[Reading], float | None]
) -> float | None:
    cutoff = history[-1].time - age
    values = [
        value for sample in history
        if cutoff - 20 * MINUTE <= sample.time <= cutoff
        and (value := sample_value(sample)) is not None
    ]
    return median(values) if len(values) >= 3 else None


def _held(
    history: Sequence[Reading], duration: int, condition: Callable[[Reading], bool]
) -> bool:
    cutoff = history[-1].time - duration
    for sample in reversed(history):
        if not condition(sample):
            return False
        if sample.time <= cutoff:
            return True
    return False


def room_signal(history: Sequence[Reading], entity_id: str) -> Room:
    """Use a two-hour trend and flag sharp isolated cooling for 45 minutes."""
    current = history[-1]
    value = current.rooms[entity_id]
    reference = _reference(history, 2 * HOUR, lambda item: item.rooms.get(entity_id))
    recent = [item for item in history if current.time - item.time <= 55 * MINUTE]
    for left, right in zip(recent, recent[1:]):
        if current.time - right.time > 45 * MINUTE:
            continue
        before, after = left.rooms.get(entity_id), right.rooms.get(entity_id)
        if before is None or after is None or before - after < 0.7:
            continue
        peer_drops = [
            temp - right.rooms[key] for key, temp in left.rooms.items()
            if key != entity_id and key in right.rooms
        ]
        if not peer_drops or max(peer_drops) < 0.45:
            return Room(entity_id, value, None if reference is None else value - reference, True)
    return Room(entity_id, value, None if reference is None else value - reference, False)


def forecast_horizon(now: datetime, settings: Settings) -> float:
    """Pick the morning deadline in the evening and a six-hour horizon by day."""
    if settings.day_start <= now.hour < settings.evening_from:
        return now.timestamp() + 6 * HOUR
    morning = now.replace(hour=settings.day_start, minute=0, second=0, microsecond=0)
    if now.hour >= settings.day_start:
        morning += timedelta(days=1)
    return morning.timestamp()


def weather_signal(
    history: Sequence[Reading], forecast: Sequence[Point], provider_now: float | None,
    horizon: float,
) -> Weather:
    """Correct forecast bias near the present and smooth single-hour lows."""
    current = history[-1]
    outdoor = current.outdoor
    if outdoor is None:
        return Weather()
    reference = _reference(history, 4 * HOUR, lambda sample: sample.outdoor)
    change = None if reference is None else outdoor - reference
    points = [point for point in forecast if current.time <= point.time <= horizon]
    if not points or points[0].time > current.time + 90 * MINUTE:
        return Weather(outdoor, change)
    offset = outdoor - (points[0].temperature if provider_now is None else provider_now)
    adjusted = []
    for point in points:
        if adjusted and point.time - adjusted[-1].time > 90 * MINUTE:
            break
        age = point.time - current.time
        correction = offset * max(0, 1 - age / (8 * HOUR))
        adjusted.append(Point(point.time, point.temperature + correction))
    if len(adjusted) < 3:
        return Weather(outdoor, change)
    low = min(
        sum(point.temperature for point in adjusted[i:i+3]) / 3
        for i in range(len(adjusted) - 2)
    )
    end = adjusted[-1].temperature if horizon - adjusted[-1].time <= 90 * MINUTE else None
    return Weather(outdoor, change, low, end)


def decide(
    settings: Settings,
    now: datetime,
    history: Sequence[Reading],
    primary_ids: Sequence[str],
    secondary_ids: Sequence[str],
    weather: Weather,
    last_dial_change: float | None,
) -> Advice:
    """Recommend holding or a single physical step, with a stable reason code."""
    current = history[-1]
    dial = current.dial
    if dial is None:
        return Advice("wait", "dial_unavailable", None, None)
    if not primary_ids or any(key not in current.rooms for key in primary_ids):
        return Advice("wait", "room_unavailable", dial, None)

    def advice(action: str, reason: str, room: Room | None = None) -> Advice:
        recommendation = dial + {"raise": 1, "lower": -1}.get(action, 0)
        if not 1 <= recommendation <= settings.max_dial:
            return Advice("hold", "dial_limit", dial, dial, room)
        return Advice(action, reason, dial, recommendation, room)

    if last_dial_change is not None and current.time - last_dial_change < SETTLE_SECONDS:
        return advice("hold", "settling")
    if not _held(history, 30 * MINUTE, lambda item: all(key in item.rooms for key in primary_ids)):
        return Advice("wait", "collecting", dial, None)

    primary = [room_signal(history, key) for key in primary_ids]
    secondary = [room_signal(history, key) for key in secondary_ids if key in current.rooms]
    if any(room.airing for room in primary):
        return advice("hold", "airing")
    all_rooms = [*primary, *secondary]
    coldest = min(primary, key=lambda room: room.temperature)
    warmest = max(all_rooms, key=lambda room: room.temperature)
    daytime = settings.day_start <= now.hour < settings.day_end
    lower = settings.day_min if daytime else settings.night_min
    upper = settings.day_max

    def sustained_cold(room: Room, limit: float, duration: int) -> bool:
        return _held(
            history, duration,
            lambda item: item.rooms.get(room.entity_id, float("inf")) < limit,
        )

    cold = sustained_cold(coldest, lower - 0.7, 30 * MINUTE) or (
        sustained_cold(coldest, lower, HOUR)
        and (coldest.delta is None or coldest.delta < 0.1)
    )
    if cold:
        if warmest.temperature >= upper:
            return advice("hold", "room_conflict", coldest)
        return advice("raise", "room_cold", coldest)
    if daytime and warmest.temperature < upper - 0.5:
        for room in secondary:
            if not room.airing and sustained_cold(room, lower - 0.4, 2 * HOUR) and (
                room.delta is None or room.delta < 0.1
            ):
                return advice("raise", "secondary_cold", room)

    observed_cooling = weather.recent_change is not None and weather.recent_change <= -2.0
    forecast_cooling = weather.drop is not None and weather.drop >= 2.0
    if settings.evening_from <= now.hour < settings.evening_until and warmest.temperature < upper:
        reference = _reference(history, 4 * HOUR, lambda item: item.rooms.get(coldest.entity_id))
        evening_delta = None if reference is None else coldest.temperature - reference
        room_cooling = (
            coldest.temperature <= settings.day_min + 1.0
            and evening_delta is not None and evening_delta <= -0.12
        )
        severe_forecast = weather.drop is not None and weather.drop >= 6.0
        if severe_forecast or (
            room_cooling and (observed_cooling or forecast_cooling) and not weather.rebounds
        ):
            return advice(
                "raise", "overnight_cold", replace(coldest, delta=evening_delta, trend_hours=4)
            )

    if settings.lower_from <= now.hour < settings.lower_until:
        floors = {key: settings.day_min + 0.5 for key in primary_ids}
        floors.update({key: settings.day_min for key in secondary_ids})
        enough_heat = all(current.rooms.get(key, -100) >= floor for key, floor in floors.items())
        cooling_risk = weather.outdoor is None or observed_cooling or forecast_cooling
        if enough_heat and not cooling_risk and not any(room.airing for room in secondary):
            if _held(history, HOUR, lambda item: item.rooms.get(warmest.entity_id, -100) >= upper):
                return advice("lower", "room_hot", warmest)
            buffers = {**floors, **{key: settings.day_min + 1.0 for key in primary_ids}}
            warming = weather.recent_change is not None and weather.recent_change >= 1.5
            if warming and weather.low is not None and coldest.delta is not None and coldest.delta >= -0.1:
                if _held(
                    history, 2 * HOUR,
                    lambda item: all(item.rooms.get(key, -100) >= floor for key, floor in buffers.items()),
                ):
                    return advice("lower", "warming_outside", coldest)

    actual_coldest = min(all_rooms, key=lambda room: room.temperature)
    if warmest.temperature >= upper and actual_coldest.temperature < lower:
        return advice("hold", "room_conflict", actual_coldest)
    in_range = lower <= actual_coldest.temperature and warmest.temperature <= upper
    return advice("hold", "within_range" if in_range else "monitoring")
