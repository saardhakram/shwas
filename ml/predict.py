"""Hourly inference script for Shwas Forecast ML.

Fetches the latest 48h history + 48h forecast weather for each Delhi location,
predicts hourly PM2.5 for the next 48 hours using ml/model/shwas_lgbm.joblib,
and upserts rows into Supabase `public.forecasts`.

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment variables
(never committed). Supports --dry-run for local verification.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import requests

from config import DELHI_STATIONS, IST_TZ, MODEL_DIR, MODEL_VERSION, StationConfig
from features import (
    FEATURE_COLUMNS,
    build_inference_features,
    clean_station_df,
    pm25_to_us_aqi,
)

OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

WEATHER_VARS = [
    "wind_speed_10m",
    "wind_direction_10m",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
]


def fetch_live_station_inputs(station: StationConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fetches past 2 days of PM2.5 + past 2 days & next 3 days of hourly weather."""
    aq_resp = requests.get(
        OPEN_METEO_AQ_URL,
        params={
            "latitude": station.lat,
            "longitude": station.lon,
            "hourly": "pm2_5",
            "past_days": 2,
            "forecast_days": 1,
            "timezone": IST_TZ,
        },
        timeout=30,
    )
    aq_resp.raise_for_status()
    aq_hourly = aq_resp.json().get("hourly") or {}
    pm_df = pd.DataFrame({"timestamp": aq_hourly["time"], "pm25": aq_hourly["pm2_5"]})

    wx_resp = requests.get(
        OPEN_METEO_WEATHER_URL,
        params={
            "latitude": station.lat,
            "longitude": station.lon,
            "hourly": ",".join(WEATHER_VARS),
            "past_days": 2,
            "forecast_days": 3,
            "timezone": IST_TZ,
        },
        timeout=30,
    )
    wx_resp.raise_for_status()
    wx_hourly = wx_resp.json().get("hourly") or {}
    wx_df = pd.DataFrame({"timestamp": wx_hourly["time"]})
    for var in WEATHER_VARS:
        wx_df[var] = wx_hourly.get(var)

    # Keep only observed hours (up to current IST hour) for historical lags
    now_ist = pd.Timestamp.now(tz=IST_TZ).floor("h")
    pm_ts = pd.to_datetime(pm_df["timestamp"]).dt.tz_localize(
        IST_TZ, ambiguous="infer", nonexistent="shift_forward"
    )
    pm_df["timestamp"] = pm_ts
    wx_df["timestamp"] = pd.to_datetime(wx_df["timestamp"]).dt.tz_localize(
        IST_TZ, ambiguous="infer", nonexistent="shift_forward"
    )

    hist_merged = pd.merge(
        pm_df[pm_df["timestamp"] <= now_ist],
        wx_df,
        on="timestamp",
        how="inner",
    )
    hist_merged["location_id"] = station.id
    hist_merged["location_name"] = station.name
    hist_merged["lat"] = station.lat
    hist_merged["lon"] = station.lon

    cleaned_hist = clean_station_df(hist_merged)
    return cleaned_hist, wx_df


def upsert_forecasts_to_supabase(rows: list[dict], supabase_url: str, service_key: str) -> None:
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/forecasts?on_conflict=location_id,horizon_hour"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    resp = requests.post(endpoint, headers=headers, json=rows, timeout=30)
    if not resp.ok:
        raise RuntimeError(f"Supabase upsert failed ({resp.status_code}): {resp.text}")


def run_predictions(dry_run: bool = False) -> list[dict]:
    model_path = MODEL_DIR / "shwas_lgbm.joblib"
    meta_path = MODEL_DIR / "metadata.json"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path}. Run `python ml/train.py` first.")

    model = joblib.load(model_path)
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    model_mae = meta.get("test_mae") or meta.get("val_mae")
    generated_at = datetime.now(timezone.utc).isoformat()

    all_rows: list[dict] = []
    for idx, station in enumerate(DELHI_STATIONS):
        hist_df, wx_df = fetch_live_station_inputs(station)
        feat_df = build_inference_features(hist_df, wx_df, location_idx=idx)
        preds = np.clip(model.predict(feat_df[FEATURE_COLUMNS]), 0.0, 999.0)

        for row_idx, pred_pm25 in enumerate(preds):
            pm_val = round(float(pred_pm25), 1)
            target_ts = feat_df.iloc[row_idx]["target_time"].tz_convert("UTC").isoformat()
            horizon_h = int(feat_df.iloc[row_idx]["horizon"])
            all_rows.append(
                {
                    "location_id": station.id,
                    "location_name": station.name,
                    "lat": station.lat,
                    "lon": station.lon,
                    "generated_at": generated_at,
                    "target_time": target_ts,
                    "horizon_hour": horizon_h,
                    "predicted_pm25": pm_val,
                    "predicted_us_aqi": pm25_to_us_aqi(pm_val),
                    "model_version": MODEL_VERSION,
                    "model_mae": float(model_mae) if model_mae is not None else None,
                }
            )
        print(
            f"[predict] {station.name}: predicted 48h PM2.5 range "
            f"{float(preds.min()):.1f} – {float(preds.max()):.1f} µg/m³"
        )

    if dry_run:
        print(f"[predict] Dry-run complete ({len(all_rows)} rows prepared, not written to Supabase).")
        return all_rows

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
        )

    upsert_forecasts_to_supabase(all_rows, supabase_url, service_key)
    print(f"[predict] Successfully upserted {len(all_rows)} forecast rows into Supabase.")
    return all_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate 48h ML PM2.5 forecasts and push to Supabase.")
    parser.add_argument("--dry-run", action="store_true", help="Run inference without writing to Supabase")
    args = parser.parse_args()
    run_predictions(dry_run=args.dry_run)


if __name__ == "__main__":
    main()

