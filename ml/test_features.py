"""Unit tests for Shwas Forecast ML cleaning, feature engineering, and temporal splitting."""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import IST_TZ
from features import (
    FEATURE_COLUMNS,
    add_origin_features,
    build_horizon_dataset,
    build_inference_features,
    clean_station_df,
    mask_flatlines,
    pm25_to_aqi_category,
    time_split,
)


def _make_synthetic_hourly(start: str, periods: int, base_pm25: float = 150.0) -> pd.DataFrame:
    ts = pd.date_range(start=start, periods=periods, freq="1h", tz=IST_TZ)
    hours = np.arange(periods)
    pm25 = base_pm25 + 40.0 * np.sin(2 * np.pi * hours / 24.0) + (hours % 7) * 2.0
    return pd.DataFrame(
        {
            "timestamp": ts.astype(str),
            "pm25": pm25,
            "wind_speed_10m": 5.0 + np.sin(hours / 6.0),
            "wind_direction_10m": (hours * 15) % 360,
            "temperature_2m": 18.0 + 6.0 * np.sin(2 * np.pi * (hours - 6) / 24.0),
            "relative_humidity_2m": 65.0 - 15.0 * np.sin(2 * np.pi * (hours - 6) / 24.0),
            "precipitation": np.zeros(periods),
            "boundary_layer_height": 300.0 + 500.0 * np.clip(np.sin(2 * np.pi * (hours - 6) / 24.0), 0, 1),
            "location_id": "delhi_ito",
            "location_name": "ITO, Central Delhi",
            "lat": 28.6289,
            "lon": 77.2405,
        }
    )


def test_clean_drops_sensor_errors_and_flatlines_over_6h():
    df = _make_synthetic_hourly("2024-11-01 00:00:00", periods=48)
    # Inject negative, >999, 8h flatline (>6h -> drop), 4h flatline (<=6h -> keep)
    df.loc[5, "pm25"] = -12.0
    df.loc[6, "pm25"] = 1200.0
    df.loc[10:17, "pm25"] = 88.0  # 8 consecutive identical hours -> sensor stuck -> NaN
    df.loc[25:28, "pm25"] = 111.0  # 4 consecutive identical hours -> valid

    cleaned = clean_station_df(df)
    # 2-hour gap (indices 5,6) should be linearly interpolated (<= 3h gap)
    assert pd.notna(cleaned.loc[5, "pm25"])
    assert pd.notna(cleaned.loc[6, "pm25"])
    assert cleaned.loc[5, "pm25"] > 0
    assert cleaned.loc[6, "pm25"] < 999

    # 8-hour flatline (> 3h gap after masking) must remain NaN (not interpolated!)
    assert cleaned.loc[10:17, "pm25"].isna().all()

    # 4-hour constant run (<= 6h) must remain intact
    assert (cleaned.loc[25:28, "pm25"] == 111.0).all()


def test_mask_flatlines_boundary_6h_vs_7h():
    s = pd.Series([10.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 30.0, 40.0, 40.0, 40.0, 40.0, 40.0, 40.0, 40.0, 50.0])
    masked = mask_flatlines(s, max_consecutive_same=6)
    # 6 occurrences of 20.0 should stay
    assert masked.iloc[1:7].notna().all()
    # 7 occurrences of 40.0 should become NaN
    assert masked.iloc[8:15].isna().all()


def test_features_flags_diwali_stubble_and_lags():
    # Diwali 2024 was 2024-10-31 (Thursday); Nov 2 is Saturday (weekend + stubble season)
    df = _make_synthetic_hourly("2024-10-29 00:00:00", periods=120)
    cleaned = clean_station_df(df)
    featured = add_origin_features(cleaned, location_idx=2)

    # Check lag_24 matches pm25 shifted by 24h
    assert np.isclose(featured.loc[30, "pm25_lag_24"], featured.loc[6, "pm25"])
    assert np.isclose(featured.loc[30, "pm25_lag_1"], featured.loc[29, "pm25"])
    assert np.isclose(featured.loc[30, "pm25_lag_6"], featured.loc[24, "pm25"])

    # Check Diwali flag on 2024-10-31
    diwali_rows = featured[featured["timestamp"].dt.strftime("%Y-%m-%d") == "2024-10-31"]
    assert (diwali_rows["origin_is_diwali"] == 1).all()
    assert (diwali_rows["origin_is_stubble_season"] == 1).all()

    # Check weekend flag on Saturday 2024-11-02
    sat_rows = featured[featured["timestamp"].dt.strftime("%Y-%m-%d") == "2024-11-02"]
    assert (sat_rows["origin_is_weekend"] == 1).all()


def test_horizon_dataset_has_no_leakage_and_temporal_split_is_strict():
    df = _make_synthetic_hourly("2024-09-01 00:00:00", periods=24 * 60)  # 60 days
    cleaned = clean_station_df(df)
    featured = add_origin_features(cleaned, location_idx=0)
    ds = build_horizon_dataset(featured, horizons=[1, 6, 24, 48], stride_hours=4)

    for col in FEATURE_COLUMNS:
        assert col in ds.columns, f"Missing feature column {col}"

    # Verify target_time == origin_time + horizon hours
    diffs = (ds["target_time"] - ds["origin_time"]).dt.total_seconds() / 3600.0
    assert np.allclose(diffs, ds["horizon"])

    # Verify strict time split with embargo
    train, val, test = time_split(ds, embargo_hours=48)
    assert len(train) > 0 and len(val) > 0 and len(test) > 0
    assert train["origin_time"].max() < val["origin_time"].min()
    assert val["origin_time"].max() < test["origin_time"].min()
    assert (val["origin_time"].min() - train["origin_time"].max()) >= pd.Timedelta(hours=48)


def test_inference_features_builds_48_horizons():
    hist = clean_station_df(_make_synthetic_hourly("2024-11-10 00:00:00", periods=48))
    future_wx = _make_synthetic_hourly("2024-11-11 00:00:00", periods=72)
    inf_df = build_inference_features(hist, future_wx, location_idx=1)
    assert len(inf_df) == 48
    assert list(inf_df["horizon"]) == list(range(1, 49))
    assert not inf_df[FEATURE_COLUMNS].isna().any().any()


def test_pm25_to_aqi_category():
    assert pm25_to_aqi_category(10.0) == "Good"
    assert pm25_to_aqi_category(40.0) == "Poor"
    assert pm25_to_aqi_category(200.0) == "Severe"
    assert pm25_to_aqi_category(310.0) == "Hazardous"

