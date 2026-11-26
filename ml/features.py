"""Cleaning, feature engineering, temporal splitting, and AQI helpers for Shwas Forecast ML."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import timedelta

import numpy as np
import pandas as pd

from config import DIWALI_DATES, HORIZONS, IST_TZ

WEATHER_COLS = [
    "wind_speed_10m",
    "wind_direction_10m",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
]

FEATURE_COLUMNS = [
    "location_idx",
    "horizon",
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
    "target_hour",
    "target_hour_sin",
    "target_hour_cos",
    "target_weekday",
    "target_month",
    "target_is_weekend",
    "target_is_diwali",
    "target_is_stubble_season",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_u",
    "wind_v",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
    "target_wind_speed_10m",
    "target_wind_u",
    "target_wind_v",
    "target_temperature_2m",
    "target_relative_humidity_2m",
    "target_precipitation",
    "target_boundary_layer_height",
]

# Precompute Diwali +/- 1 day set for fast vectorized lookup
_DIWALI_WINDOW: set = set()
for _d in DIWALI_DATES:
    for _delta in (-1, 0, 1):
        _DIWALI_WINDOW.add(_d + timedelta(days=_delta))


def pm25_to_us_aqi(pm25: float) -> int:
    """Standard US EPA PM2.5 (µg/m³) -> US AQI linear breakpoint conversion."""
    c = max(0.0, float(pm25))
    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    c_trunc = np.floor(c * 10.0) / 10.0
    for c_low, c_high, i_low, i_high in breakpoints:
        if c_trunc <= c_high:
            return int(round(((i_high - i_low) / (c_high - c_low)) * (c_trunc - c_low) + i_low))
    return 500


def pm25_to_aqi_category(pm25: np.ndarray | pd.Series | float) -> np.ndarray | str:
    """Maps PM2.5 (µg/m³) to 6 standard AQI categories (Good -> Hazardous)."""
    bins = [-np.inf, 12.0, 35.4, 55.4, 150.4, 250.4, np.inf]
    labels = ["Good", "Moderate", "Poor", "Very Poor", "Severe", "Hazardous"]
    if np.isscalar(pm25):
        val = float(pm25)
        for upper, label in zip(bins[1:], labels, strict=True):
            if val <= upper:
                return label
        return "Hazardous"
    arr = np.asarray(pm25, dtype=float)
    cat = pd.cut(arr, bins=bins, labels=labels, right=True)
    return cat.astype(str).to_numpy()


def mask_flatlines(series: pd.Series, max_consecutive_same: int = 6) -> pd.Series:
    """Masks runs where a sensor reports the exact same value for > max_consecutive_same hours.

    Example: 7 identical consecutive readings (run length > 6) are treated as stuck sensor
    errors and set to NaN. Runs of length <= 6 are preserved.
    """
    s = series.copy()
    valid = s.notna()
    # Identify groups of identical consecutive values (breaking on NaN)
    changed = (s != s.shift(1)) | (~valid) | (~valid.shift(1, fill_value=False))
    run_id = changed.cumsum()
    run_lengths = s.groupby(run_id).transform("count")
    flatline_mask = valid & (run_lengths > max_consecutive_same)
    s.loc[flatline_mask] = np.nan
    return s


def clean_station_df(df: pd.DataFrame) -> pd.DataFrame:
    """Cleans raw hourly station dataframe:
    1. Parse timestamps into IST timezone and resample to strict 1-hour grid.
    2. Drop sensor errors: negative PM2.5, PM2.5 > 999, and flat-lines longer than 6h.
    3. Interpolate gaps up to 3h; leave longer gaps as NaN (dropped later during framing).
    """
    out = df.copy()
    ts = pd.to_datetime(out["timestamp"], utc=True, errors="coerce")
    out["timestamp"] = ts.dt.tz_convert(IST_TZ)
    out = out.dropna(subset=["timestamp"]).sort_values("timestamp")

    # Separate numeric vs metadata columns before hourly resampling
    numeric_cols = ["pm25"] + [c for c in WEATHER_COLS if c in out.columns]
    for col in numeric_cols:
        out[col] = pd.to_numeric(out[col], errors="coerce")

    meta_cols = [c for c in ("location_id", "location_name", "lat", "lon") if c in out.columns]
    meta_vals = {c: out[c].iloc[0] for c in meta_cols}

    hourly = out.set_index("timestamp")[numeric_cols].resample("1h").mean()

    # Drop sensor errors on PM2.5
    pm = hourly["pm25"].copy()
    pm[(pm < 0) | (pm > 999)] = np.nan
    pm = mask_flatlines(pm, max_consecutive_same=6)

    # Interpolate gaps up to 3 consecutive hours only; keep longer gaps as NaN
    pm_interp = pm.interpolate(method="linear", limit=3, limit_area="inside")
    # Ensure runs of >3 NaNs stay completely NaN (pandas limit=3 fills the first 3 of a longer gap!)
    is_na = pm.isna()
    na_groups = (~is_na).cumsum()
    na_run_len = is_na.groupby(na_groups).transform("sum")
    pm_interp[is_na & (na_run_len > 3)] = np.nan
    hourly["pm25"] = pm_interp

    # Weather: interpolate gaps up to 6h, fill missing BLH with diurnal median if absent
    for col in WEATHER_COLS:
        if col not in hourly.columns:
            hourly[col] = np.nan
        else:
            hourly[col] = hourly[col].interpolate(method="linear", limit=6, limit_area="inside")

    if hourly["boundary_layer_height"].isna().all():
        # Diurnal boundary-layer height fallback (meters) if archive endpoint lacked BLH
        hours = hourly.index.hour
        hourly["boundary_layer_height"] = 300.0 + 700.0 * np.clip(
            np.sin((hours - 6) * np.pi / 12.0), 0.0, 1.0
        )
    else:
        hourly["boundary_layer_height"] = hourly["boundary_layer_height"].fillna(
            hourly["boundary_layer_height"].median()
        )

    for col in WEATHER_COLS:
        if hourly[col].isna().any():
            hourly[col] = hourly[col].fillna(
                hourly[col].median() if hourly[col].notna().any() else 0.0
            )

    hourly = hourly.reset_index()
    for col, val in meta_vals.items():
        hourly[col] = val

    return hourly


def add_origin_features(hourly_df: pd.DataFrame, location_idx: int = 0) -> pd.DataFrame:
    """Computes lag, rolling, calendar, event, and weather features on a strict 1-hour IST grid."""
    df = hourly_df.sort_values("timestamp").reset_index(drop=True).copy()
    pm = df["pm25"]

    df["location_idx"] = int(location_idx)
    df["pm25_now"] = pm
    df["pm25_lag_1"] = pm.shift(1)
    df["pm25_lag_3"] = pm.shift(3)
    df["pm25_lag_6"] = pm.shift(6)
    df["pm25_lag_24"] = pm.shift(24)

    df["pm25_roll_6h"] = pm.rolling(window=6, min_periods=3).mean()
    df["pm25_roll_12h"] = pm.rolling(window=12, min_periods=6).mean()
    df["pm25_roll_24h"] = pm.rolling(window=24, min_periods=12).mean()

    df["pm25_diff_1h"] = pm - df["pm25_lag_1"]
    df["pm25_diff_24h"] = pm - df["pm25_lag_24"]

    ts = pd.to_datetime(df["timestamp"])
    ts = ts.dt.tz_localize(IST_TZ) if ts.dt.tz is None else ts.dt.tz_convert(IST_TZ)
    df["timestamp"] = ts

    df["origin_hour"] = ts.dt.hour
    df["origin_hour_sin"] = np.sin(2 * np.pi * df["origin_hour"] / 24.0)
    df["origin_hour_cos"] = np.cos(2 * np.pi * df["origin_hour"] / 24.0)
    df["origin_weekday"] = ts.dt.day_of_week
    df["origin_month"] = ts.dt.month
    df["origin_is_weekend"] = (df["origin_weekday"] >= 5).astype(int)
    df["origin_is_diwali"] = ts.dt.date.isin(_DIWALI_WINDOW).astype(int)
    df["origin_is_stubble_season"] = df["origin_month"].isin([10, 11]).astype(int)

    # Wind vector components (u, v) for smooth directional learning
    rad = np.deg2rad(df["wind_direction_10m"].fillna(0.0))
    spd = df["wind_speed_10m"].fillna(0.0)
    df["wind_u"] = -spd * np.sin(rad)
    df["wind_v"] = -spd * np.cos(rad)

    return df


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
    origin_cols = [
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
    present_origin_cols = [c for c in origin_cols if c in df.columns]

    blocks: list[pd.DataFrame] = []
    pm = df["pm25"]

    for h in horizons:
        block = df[present_origin_cols].copy()
        block = block.rename(columns={"timestamp": "origin_time"})
        block["horizon"] = int(h)
        block["target_time"] = df["timestamp"].shift(-h)
        block["y"] = pm.shift(-h)

        # Target-time calendar & weather features (legitimately available via forecast at time t)
        block["target_hour"] = df["origin_hour"].shift(-h)
        block["target_hour_sin"] = df["origin_hour_sin"].shift(-h)
        block["target_hour_cos"] = df["origin_hour_cos"].shift(-h)
        block["target_weekday"] = df["origin_weekday"].shift(-h)
        block["target_month"] = df["origin_month"].shift(-h)
        block["target_is_weekend"] = df["origin_is_weekend"].shift(-h)
        block["target_is_diwali"] = df["origin_is_diwali"].shift(-h)
        block["target_is_stubble_season"] = df["origin_is_stubble_season"].shift(-h)

        block["target_wind_speed_10m"] = df["wind_speed_10m"].shift(-h)
        block["target_wind_u"] = df["wind_u"].shift(-h)
        block["target_wind_v"] = df["wind_v"].shift(-h)
        block["target_temperature_2m"] = df["temperature_2m"].shift(-h)
        block["target_relative_humidity_2m"] = df["relative_humidity_2m"].shift(-h)
        block["target_precipitation"] = df["precipitation"].shift(-h)
        block["target_boundary_layer_height"] = df["boundary_layer_height"].shift(-h)

        # Baselines (strictly causal — no future PM2.5 leakage)
        block["baseline_persistence"] = df["pm25_now"]
        # Most recent observed reading at the same hour of day as target_time (t + h)
        same_hour_shift = 24 - h if h <= 24 else 48 - h
        block["baseline_same_hour_yesterday"] = pm.shift(same_hour_shift)

        if stride_hours > 1:
            block = block.iloc[::stride_hours]

        blocks.append(block)

    combined = pd.concat(blocks, ignore_index=True)

    # Drop any rows with missing target, missing origin PM2.5/lags, or missing baselines
    required = [
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
    combined = combined.dropna(subset=required).reset_index(drop=True)
    return combined


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
    origin_time = origin_row["timestamp"]

    wx = future_weather.copy()
    wx_ts = pd.to_datetime(wx["timestamp"])
    wx_ts = wx_ts.dt.tz_localize(IST_TZ) if wx_ts.dt.tz is None else wx_ts.dt.tz_convert(IST_TZ)
    wx["timestamp"] = wx_ts
    wx = wx.set_index("timestamp").sort_index()

    rows: list[dict] = []
    for h in horizons:
        target_ts = origin_time + pd.Timedelta(hours=int(h))
        # Locate closest weather forecast hour
        if target_ts in wx.index:
            w_row = wx.loc[target_ts]
            if isinstance(w_row, pd.DataFrame):
                w_row = w_row.iloc[0]
        else:
            idx_pos = wx.index.get_indexer([target_ts], method="nearest")[0]
            w_row = wx.iloc[idx_pos]

        t_spd = float(w_row.get("wind_speed_10m", origin_row["wind_speed_10m"]))
        t_dir = float(w_row.get("wind_direction_10m", origin_row["wind_direction_10m"]))
        t_rad = np.deg2rad(t_dir)
        t_hour = target_ts.hour
        t_weekday = target_ts.weekday()
        t_month = target_ts.month

        rows.append(
            {
                "origin_time": origin_time,
                "target_time": target_ts,
                "horizon": int(h),
                "location_idx": int(location_idx),
                "pm25_now": float(origin_row["pm25_now"]),
                "pm25_lag_1": float(
                    origin_row["pm25_lag_1"]
                    if pd.notna(origin_row["pm25_lag_1"])
                    else origin_row["pm25_now"]
                ),
                "pm25_lag_3": float(
                    origin_row["pm25_lag_3"]
                    if pd.notna(origin_row["pm25_lag_3"])
                    else origin_row["pm25_now"]
                ),
                "pm25_lag_6": float(
                    origin_row["pm25_lag_6"]
                    if pd.notna(origin_row["pm25_lag_6"])
                    else origin_row["pm25_now"]
                ),
                "pm25_lag_24": float(
                    origin_row["pm25_lag_24"]
                    if pd.notna(origin_row["pm25_lag_24"])
                    else origin_row["pm25_now"]
                ),
                "pm25_roll_6h": float(origin_row["pm25_roll_6h"]),
                "pm25_roll_12h": float(origin_row["pm25_roll_12h"]),
                "pm25_roll_24h": float(origin_row["pm25_roll_24h"]),
                "pm25_diff_1h": float(
                    origin_row["pm25_diff_1h"] if pd.notna(origin_row["pm25_diff_1h"]) else 0.0
                ),
                "pm25_diff_24h": float(
                    origin_row["pm25_diff_24h"] if pd.notna(origin_row["pm25_diff_24h"]) else 0.0
                ),
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
                "target_is_diwali": int(target_ts.date() in _DIWALI_WINDOW),
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
                "target_temperature_2m": float(
                    w_row.get("temperature_2m", origin_row["temperature_2m"])
                ),
                "target_relative_humidity_2m": float(
                    w_row.get("relative_humidity_2m", origin_row["relative_humidity_2m"])
                ),
                "target_precipitation": float(w_row.get("precipitation", 0.0)),
                "target_boundary_layer_height": float(
                    w_row.get("boundary_layer_height", origin_row["boundary_layer_height"])
                ),
            }
        )

    return pd.DataFrame(rows)


def time_split(
    dataset: pd.DataFrame,
    embargo_hours: int = 48,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Splits dataset strictly by TIME only (origin_time) with a 48h embargo between splits.

    Targets testing on the latest complete winter season (Nov 1 -> Feb 15 of the most recent
    winter present in the dataset), validating on the ~3.5 months preceding it, and training
    on all older data (including prior winters). Falls back to 70/15/15 chronological split
    if the dataset spans less than 12 months.
    """
    df = dataset.sort_values("origin_time").reset_index(drop=True)
    min_t = df["origin_time"].min()
    max_t = df["origin_time"].max()
    total_days = (max_t - min_t).total_seconds() / 86400.0
    embargo = pd.Timedelta(hours=embargo_hours)

    if total_days >= 400:
        # Select the latest winter window: Nov 1 -> Feb 15
        # Determine most recent November 1 that leaves at least 60 days of test data
        candidate_nov_year = max_t.year if max_t.month >= 11 else max_t.year - 1
        test_start = pd.Timestamp(year=candidate_nov_year, month=11, day=1, tz=IST_TZ)
        if (max_t - test_start).days < 60:
            test_start = pd.Timestamp(year=candidate_nov_year - 1, month=11, day=1, tz=IST_TZ)

        test_end = min(max_t, test_start + pd.Timedelta(days=110))
        val_end = test_start - embargo
        val_start = val_end - pd.Timedelta(days=105)
        train_end = val_start - embargo

        train = df[df["origin_time"] <= train_end].copy()
        val = df[(df["origin_time"] >= val_start) & (df["origin_time"] <= val_end)].copy()
        test = df[(df["origin_time"] >= test_start) & (df["origin_time"] <= test_end)].copy()

        if len(train) > 500 and len(val) > 200 and len(test) > 200:
            return train, val, test

    # Fallback pure chronological 70 / 15 / 15 split with 48h embargo
    unique_times = df["origin_time"].sort_values().unique()
    n = len(unique_times)
    t_train_end = pd.Timestamp(unique_times[int(n * 0.70)])
    t_val_start = t_train_end + embargo
    t_val_end = pd.Timestamp(unique_times[int(n * 0.85)])
    t_test_start = t_val_end + embargo

    train = df[df["origin_time"] <= t_train_end].copy()
    val = df[(df["origin_time"] >= t_val_start) & (df["origin_time"] <= t_val_end)].copy()
    test = df[df["origin_time"] >= t_test_start].copy()
    return train, val, test
