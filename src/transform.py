"""Raw Garmin JSON -> normalized rows.

Every field is read defensively. The upstream API is unofficial, so a renamed
key has to produce a NULL plus a data-quality flag, never a crash that loses
the whole day.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from . import config


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return None if (isinstance(value, float) and math.isnan(value)) else value
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    n = _num(value)
    return None if n is None else int(round(n))


def _local_iso(epoch_ms: Any) -> str | None:
    """Garmin's *Local timestamps are epoch ms already shifted to local time.

    Reading them as UTC therefore gives back the local wall clock, which is
    what we want to store: this dashboard only ever asks "what time did he go
    to bed", never "what instant was that globally".
    """
    n = _num(epoch_ms)
    if n is None:
        return None
    return datetime.fromtimestamp(n / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


# --------------------------------------------------------------------------
# daily metrics
# --------------------------------------------------------------------------

def from_stats(payload: dict | None) -> dict[str, Any]:
    """get_stats: steps, calories, resting HR, stress buckets, body battery."""
    if not isinstance(payload, dict):
        return {}
    return _drop_none({
        "resting_hr": _int(payload.get("restingHeartRate")),
        "min_hr": _int(payload.get("minHeartRate")),
        "max_hr": _int(payload.get("maxHeartRate")),
        "avg_hr_7d": _num(payload.get("lastSevenDaysAvgRestingHeartRate")),
        "stress_avg": _int(payload.get("averageStressLevel")),
        "stress_max": _int(payload.get("maxStressLevel")),
        "stress_rest_seconds": _int(payload.get("restStressDuration")),
        "stress_low_seconds": _int(payload.get("lowStressDuration")),
        "stress_medium_seconds": _int(payload.get("mediumStressDuration")),
        "stress_high_seconds": _int(payload.get("highStressDuration")),
        "body_battery_high": _int(payload.get("bodyBatteryHighestValue")),
        "body_battery_low": _int(payload.get("bodyBatteryLowestValue")),
        "body_battery_charged": _int(payload.get("bodyBatteryChargedValue")),
        "body_battery_drained": _int(payload.get("bodyBatteryDrainedValue")),
        "steps": _int(payload.get("totalSteps")),
        "step_goal": _int(payload.get("dailyStepGoal")),
        "floors_climbed": _int(payload.get("floorsAscended")),
        "distance_m": _num(payload.get("totalDistanceMeters")),
        "calories_total": _int(payload.get("totalKilocalories")),
        "calories_active": _int(payload.get("activeKilocalories")),
        "intensity_moderate_min": _int(payload.get("moderateIntensityMinutes")),
        "intensity_vigorous_min": _int(payload.get("vigorousIntensityMinutes")),
        "spo2_avg": _num(payload.get("averageSpo2")),
        "respiration_avg": _num(payload.get("avgWakingRespirationValue")),
    })


def from_sleep(payload: dict | None) -> dict[str, Any]:
    """get_sleep_data: stages, score, and when the night actually started."""
    if not isinstance(payload, dict):
        return {}
    dto = payload.get("dailySleepDTO")
    if not isinstance(dto, dict):
        return {}
    scores = dto.get("sleepScores") or {}
    overall = scores.get("overall") if isinstance(scores, dict) else None
    overall = overall if isinstance(overall, dict) else {}
    return _drop_none({
        "sleep_score": _int(overall.get("value")),
        "sleep_quality": overall.get("qualifierKey"),
        "sleep_seconds": _int(dto.get("sleepTimeSeconds")),
        "deep_seconds": _int(dto.get("deepSleepSeconds")),
        "light_seconds": _int(dto.get("lightSleepSeconds")),
        "rem_seconds": _int(dto.get("remSleepSeconds")),
        "awake_seconds": _int(dto.get("awakeSleepSeconds")),
        "sleep_start_local": _local_iso(dto.get("sleepStartTimestampLocal")),
        "sleep_end_local": _local_iso(dto.get("sleepEndTimestampLocal")),
        "sleep_stress_avg": _num(dto.get("avgSleepStress")),
        "respiration_avg": _num(dto.get("averageRespirationValue")),
        "spo2_avg": _num(dto.get("averageSpO2Value") or dto.get("averageSpo2Value")),
    })


def from_hrv(payload: dict | None) -> dict[str, Any]:
    """get_hrv_data: last night's overnight HRV plus Garmin's own baseline."""
    if not isinstance(payload, dict):
        return {}
    summary = payload.get("hrvSummary")
    if not isinstance(summary, dict):
        return {}
    baseline = summary.get("baseline") if isinstance(summary.get("baseline"), dict) else {}
    return _drop_none({
        "hrv_last_night": _num(summary.get("lastNightAvg")),
        "hrv_last_night_high": _num(summary.get("lastNight5MinHigh")),
        "hrv_weekly_avg": _num(summary.get("weeklyAvg")),
        "hrv_status": summary.get("status"),
        "hrv_baseline_low": _num(baseline.get("lowUpper")),
        "hrv_baseline_balanced_low": _num(baseline.get("balancedLow")),
        "hrv_baseline_balanced_high": _num(baseline.get("balancedUpper")),
    })


def from_readiness(payload: Any) -> dict[str, Any]:
    """get_training_readiness returns a list; the first entry is the day's."""
    if isinstance(payload, list):
        payload = payload[0] if payload else None
    if not isinstance(payload, dict):
        return {}
    return _drop_none({
        "training_readiness": _int(payload.get("score")),
        "training_readiness_level": payload.get("level"),
    })


def _drop_none(d: dict[str, Any]) -> dict[str, Any]:
    """Keep only fields that actually arrived.

    db.upsert_daily updates exactly the columns it is given, so dropping the
    Nones here is what stops an empty HRV response from wiping a good value
    written by an earlier run.
    """
    return {k: v for k, v in d.items() if v is not None}


# --------------------------------------------------------------------------
# activities and training load
# --------------------------------------------------------------------------

def banister_trimp(duration_s: float, avg_hr: float, resting_hr: float) -> float:
    """Banister TRIMP, the standard heart-rate training load.

    duration in minutes x heart rate reserve fraction x an exponential weight,
    so an hour hard counts for much more than an hour easy. Garmin's own
    activityTrainingLoad uses a different, undocumented scale, so we compute
    our own for every activity and use only this one in the acute:chronic
    ratio. Mixing two scales in one ratio would be meaningless.
    """
    hr_reserve = max(config.HR_MAX - resting_hr, 1)
    f = (avg_hr - resting_hr) / hr_reserve
    f = min(max(f, 0.0), 1.0)
    minutes = duration_s / 60.0
    return round(minutes * f * 0.64 * math.exp(1.92 * f), 1)


def activity_row(activity: dict, resting_hr: int | None) -> dict[str, Any]:
    start_local = activity.get("startTimeLocal")
    day = str(start_local)[:10] if start_local else None

    type_key = None
    atype = activity.get("activityType")
    if isinstance(atype, dict):
        type_key = atype.get("typeKey")

    duration_s = _num(activity.get("duration")) or 0.0
    avg_hr = _num(activity.get("averageHR"))
    rhr = resting_hr if resting_hr else config.HR_REST_FALLBACK

    if avg_hr and avg_hr > rhr:
        computed = banister_trimp(duration_s, avg_hr, rhr)
        source = "trimp"
    else:
        # No usable heart rate: the activity still happened, so it gets a
        # flat duration-based load rather than a zero that would understate
        # the week. 0.4 per minute is roughly what TRIMP returns for light
        # effort, which is the safe assumption when we cannot measure it.
        computed = round(duration_s / 60.0 * 0.4, 1)
        source = "duration"

    return {
        "activity_id": _int(activity.get("activityId")),
        "date": day,
        "start_local": start_local,
        "type_key": type_key,
        "name": activity.get("activityName"),
        "duration_s": duration_s,
        "moving_duration_s": _num(activity.get("movingDuration")),
        "distance_m": _num(activity.get("distance")),
        "calories": _num(activity.get("calories")),
        "avg_hr": avg_hr,
        "max_hr": _num(activity.get("maxHR")),
        "garmin_load": _num(activity.get("activityTrainingLoad")),
        "computed_load": computed,
        "load_source": source,
        "aerobic_te": _num(activity.get("aerobicTrainingEffect")),
        "anaerobic_te": _num(activity.get("anaerobicTrainingEffect")),
        "elevation_gain_m": _num(activity.get("elevationGain")),
        "steps": _int(activity.get("steps")),
    }
