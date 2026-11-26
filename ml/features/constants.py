"""Shared feature column lists and calendar lookup windows for Shwas Forecast ML."""

from __future__ import annotations

from datetime import date, timedelta

from config import DIWALI_DATES

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
DIWALI_WINDOW: set[date] = {
    diwali_day + timedelta(days=delta) for diwali_day in DIWALI_DATES for delta in (-1, 0, 1)
}
