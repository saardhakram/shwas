"""Origin-time lag, rolling, calendar, event, and wind-vector feature engineering."""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import IST_TZ

from .constants import DIWALI_WINDOW


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
    df["origin_is_diwali"] = ts.dt.date.isin(DIWALI_WINDOW).astype(int)
    df["origin_is_stubble_season"] = df["origin_month"].isin([10, 11]).astype(int)

    rad = np.deg2rad(df["wind_direction_10m"].fillna(0.0))
    spd = df["wind_speed_10m"].fillna(0.0)
    df["wind_u"] = -spd * np.sin(rad)
    df["wind_v"] = -spd * np.cos(rad)

    return df
