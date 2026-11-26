"""Direct multi-horizon training framing and live 48-hour inference feature builders."""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd

from config import HORIZONS, IST_TZ

from .constants import DIWALI_WINDOW
from .origin import add_origin_features

_ORIGIN_COLS = [
    "timestamp",
    "location_id",
    "location_idx",
    "pm25_now",
    "pm25_lag_1",
    "pm25_lag_3",
    "pm25_lag_6",
    "pm25_lag_24",
    "pm25_roll_6h",
    "pm25_roll_12h",
    "pm25_roll_24h",
    "pm25_diff_1h",
    "pm25_diff_24h",
    "origin_hour",
    "origin_hour_sin",
    "origin_hour_cos",
    "origin_weekday",
    "origin_month",
    "origin_is_weekend",
    "origin_is_diwali",
    "origin_is_stubble_season",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_u",
    "wind_v",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
]

_REQUIRED_SUPERVISED_COLS = [
    "y",
    "target_time",
    "pm25_now",
    "pm25_lag_1",
    "pm25_lag_3",
    "pm25_lag_6",
    "pm25_lag_24",
    "baseline_persistence",
    "baseline_same_hour_yesterday",
]

_TARGET_SHIFT_MAP = {
    "target_hour": "origin_hour",
    "target_hour_sin": "origin_hour_sin",
    "target_hour_cos": "origin_hour_cos",
    "target_weekday": "origin_weekday",
    "target_month": "origin_month",
    "target_is_weekend": "origin_is_weekend",
    "target_is_diwali": "origin_is_diwali",
    "target_is_stubble_season": "origin_is_stubble_season",
    "target_wind_speed_10m": "wind_speed_10m",
    "target_wind_u": "wind_u",
    "target_wind_v": "wind_v",
    "target_temperature_2m": "temperature_2m",
    "target_relative_humidity_2m": "relative_humidity_2m",
    "target_precipitation": "precipitation",
    "target_boundary_layer_height": "boundary_layer_height",
}


def build_horizon_dataset(
    featured_hourly: pd.DataFrame,
    horizons: Iterable[int] = HORIZONS,
    stride_hours: int = 1,
) -> pd.DataFrame:
    """Expands an hourly featured station DataFrame into a direct multi-horizon dataset (h=1..48).

    Uses strict temporal shifting on the hourly grid so:
    - Features at forecast origin `t` only use observations <= t (plus weather at t+h).
    - Target `y` is `pm25(t + h)`.
    - Baseline `baseline_persistence` is `pm25(t)`.
    - Baseline `baseline_same_hour_yesterday` is `pm25(t + h - 24)` for h<=24 and
      `pm25(t + h - 48)` for 24<h<=48 (strictly observed at origin t, zero leakage).
    """
    df = featured_hourly.sort_values("timestamp").reset_index(drop=True)
    present_origin_cols = [c for c in _ORIGIN_COLS if c in df.columns]
    pm = df["pm25"]

    blocks: list[pd.DataFrame] = []
    for h in horizons:
        block = df[present_origin_cols].copy().rename(columns={"timestamp": "origin_time"})
        block["horizon"] = int(h)
        block["target_time"] = df["timestamp"].shift(-h)
        block["y"] = pm.shift(-h)

        for target_col, source_col in _TARGET_SHIFT_MAP.items():
            block[target_col] = df[source_col].shift(-h)

        block["baseline_persistence"] = df["pm25_now"]
        same_hour_shift = 24 - h if h <= 24 else 48 - h
        block["baseline_same_hour_yesterday"] = pm.shift(same_hour_shift)

        if stride_hours > 1:
            block = block.iloc[::stride_hours]

        blocks.append(block)

    combined = pd.concat(blocks, ignore_index=True)
    return combined.dropna(subset=_REQUIRED_SUPERVISED_COLS).reset_index(drop=True)


def _lookup_weather_row(wx: pd.DataFrame, target_ts: pd.Timestamp) -> pd.Series:
    """Returns the weather row at `target_ts` or the closest available forecast hour."""
    if target_ts in wx.index:
        w_row = wx.loc[target_ts]
        return w_row.iloc[0] if isinstance(w_row, pd.DataFrame) else w_row
    idx_pos = wx.index.get_indexer([target_ts], method="nearest")[0]
    return wx.iloc[idx_pos]


def _value_or_fallback(row: pd.Series, col: str, fallback: float) -> float:
    """Extracts a float feature value, falling back if NaN."""
    val = row[col]
    return float(val) if pd.notna(val) else fallback


def _build_inference_row(
    origin_row: pd.Series,
    wx: pd.DataFrame,
    location_idx: int,
    horizon: int,
) -> dict:
    """Constructs one inference feature dict for a single forecast horizon."""
    origin_time = origin_row["timestamp"]
    target_ts = origin_time + pd.Timedelta(hours=int(horizon))
    w_row = _lookup_weather_row(wx, target_ts)

    pm_now = float(origin_row["pm25_now"])
    t_spd = float(w_row.get("wind_speed_10m", origin_row["wind_speed_10m"]))
    t_dir = float(w_row.get("wind_direction_10m", origin_row["wind_direction_10m"]))
    t_rad = np.deg2rad(t_dir)
    t_hour = target_ts.hour
    t_weekday = target_ts.weekday()
    t_month = target_ts.month

    return {
        "origin_time": origin_time,
        "target_time": target_ts,
        "horizon": int(horizon),
        "location_idx": int(location_idx),
        "pm25_now": pm_now,
        "pm25_lag_1": _value_or_fallback(origin_row, "pm25_lag_1", pm_now),
        "pm25_lag_3": _value_or_fallback(origin_row, "pm25_lag_3", pm_now),
        "pm25_lag_6": _value_or_fallback(origin_row, "pm25_lag_6", pm_now),
        "pm25_lag_24": _value_or_fallback(origin_row, "pm25_lag_24", pm_now),
        "pm25_roll_6h": float(origin_row["pm25_roll_6h"]),
        "pm25_roll_12h": float(origin_row["pm25_roll_12h"]),
        "pm25_roll_24h": float(origin_row["pm25_roll_24h"]),
        "pm25_diff_1h": _value_or_fallback(origin_row, "pm25_diff_1h", 0.0),
        "pm25_diff_24h": _value_or_fallback(origin_row, "pm25_diff_24h", 0.0),
        "origin_hour": int(origin_row["origin_hour"]),
        "origin_hour_sin": float(origin_row["origin_hour_sin"]),
        "origin_hour_cos": float(origin_row["origin_hour_cos"]),
        "origin_weekday": int(origin_row["origin_weekday"]),
        "origin_month": int(origin_row["origin_month"]),
        "origin_is_weekend": int(origin_row["origin_is_weekend"]),
        "origin_is_diwali": int(origin_row["origin_is_diwali"]),
        "origin_is_stubble_season": int(origin_row["origin_is_stubble_season"]),
        "target_hour": int(t_hour),
        "target_hour_sin": float(np.sin(2 * np.pi * t_hour / 24.0)),
        "target_hour_cos": float(np.cos(2 * np.pi * t_hour / 24.0)),
        "target_weekday": int(t_weekday),
        "target_month": int(t_month),
        "target_is_weekend": int(t_weekday >= 5),
        "target_is_diwali": int(target_ts.date() in DIWALI_WINDOW),
        "target_is_stubble_season": int(t_month in (10, 11)),
        "wind_speed_10m": float(origin_row["wind_speed_10m"]),
        "wind_direction_10m": float(origin_row["wind_direction_10m"]),
        "wind_u": float(origin_row["wind_u"]),
        "wind_v": float(origin_row["wind_v"]),
        "temperature_2m": float(origin_row["temperature_2m"]),
        "relative_humidity_2m": float(origin_row["relative_humidity_2m"]),
        "precipitation": float(origin_row["precipitation"]),
        "boundary_layer_height": float(origin_row["boundary_layer_height"]),
        "target_wind_speed_10m": t_spd,
        "target_wind_u": float(-t_spd * np.sin(t_rad)),
        "target_wind_v": float(-t_spd * np.cos(t_rad)),
        "target_temperature_2m": float(w_row.get("temperature_2m", origin_row["temperature_2m"])),
        "target_relative_humidity_2m": float(
            w_row.get("relative_humidity_2m", origin_row["relative_humidity_2m"])
        ),
        "target_precipitation": float(w_row.get("precipitation", 0.0)),
        "target_boundary_layer_height": float(
            w_row.get("boundary_layer_height", origin_row["boundary_layer_height"])
        ),
    }


def build_inference_features(
    history_hourly: pd.DataFrame,
    future_weather: pd.DataFrame,
    location_idx: int,
    horizons: Iterable[int] = HORIZONS,
) -> pd.DataFrame:
    """Builds the 48-row live inference feature DataFrame from history + 48h weather forecast."""
    hist = add_origin_features(history_hourly, location_idx=location_idx)
    valid_hist = hist.dropna(subset=["pm25_now", "pm25_lag_24"])
    if valid_hist.empty:
        valid_hist = hist.dropna(subset=["pm25_now"])
    if valid_hist.empty:
        raise ValueError("No valid recent PM2.5 reading available for inference.")

    origin_row = valid_hist.iloc[-1]

    wx = future_weather.copy()
    wx_ts = pd.to_datetime(wx["timestamp"])
    wx_ts = wx_ts.dt.tz_localize(IST_TZ) if wx_ts.dt.tz is None else wx_ts.dt.tz_convert(IST_TZ)
    wx["timestamp"] = wx_ts
    wx = wx.set_index("timestamp").sort_index()

    rows = [_build_inference_row(origin_row, wx, location_idx, h) for h in horizons]
    return pd.DataFrame(rows)
