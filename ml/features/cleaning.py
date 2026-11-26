"""Hourly station data cleaning, sensor error masking, and short-gap interpolation."""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import IST_TZ

from .constants import WEATHER_COLS


def mask_flatlines(series: pd.Series, max_consecutive_same: int = 6) -> pd.Series:
    """Masks runs where a sensor reports the exact same value for > max_consecutive_same hours.

    Example: 7 identical consecutive readings (run length > 6) are treated as stuck sensor
    errors and set to NaN. Runs of length <= 6 are preserved.
    """
    s = series.copy()
    valid = s.notna()
    changed = (s != s.shift(1)) | (~valid) | (~valid.shift(1, fill_value=False))
    run_id = changed.cumsum()
    run_lengths = s.groupby(run_id).transform("count")
    flatline_mask = valid & (run_lengths > max_consecutive_same)
    s.loc[flatline_mask] = np.nan
    return s


def _interpolate_short_pm25_gaps(pm: pd.Series, max_gap_hours: int = 3) -> pd.Series:
    """Interpolates interior PM2.5 gaps up to `max_gap_hours`; leaves longer gaps as NaN."""
    pm_interp = pm.interpolate(method="linear", limit=max_gap_hours, limit_area="inside")
    is_na = pm.isna()
    na_groups = (~is_na).cumsum()
    na_run_len = is_na.groupby(na_groups).transform("sum")
    pm_interp[is_na & (na_run_len > max_gap_hours)] = np.nan
    return pm_interp


def _fill_weather_columns(hourly: pd.DataFrame) -> None:
    """Interpolates weather gaps up to 6h and fills missing BLH/medians in place."""
    for col in WEATHER_COLS:
        if col not in hourly.columns:
            hourly[col] = np.nan
        else:
            hourly[col] = hourly[col].interpolate(method="linear", limit=6, limit_area="inside")

    if hourly["boundary_layer_height"].isna().all():
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

    numeric_cols = ["pm25"] + [c for c in WEATHER_COLS if c in out.columns]
    for col in numeric_cols:
        out[col] = pd.to_numeric(out[col], errors="coerce")

    meta_cols = [c for c in ("location_id", "location_name", "lat", "lon") if c in out.columns]
    meta_vals = {c: out[c].iloc[0] for c in meta_cols}

    hourly = out.set_index("timestamp")[numeric_cols].resample("1h").mean()

    pm = hourly["pm25"].copy()
    pm[(pm < 0) | (pm > 999)] = np.nan
    pm = mask_flatlines(pm, max_consecutive_same=6)
    hourly["pm25"] = _interpolate_short_pm25_gaps(pm, max_gap_hours=3)

    _fill_weather_columns(hourly)

    hourly = hourly.reset_index()
    for col, val in meta_vals.items():
        hourly[col] = val

    return hourly
