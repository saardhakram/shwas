"""Data collection script for Shwas Forecast ML.

Downloads 2.5 years of hourly PM2.5 and historical weather for 3 Delhi locations:
- PM2.5: OpenAQ v3 (nearest CPCB station) if OPENAQ_API_KEY is set, otherwise
  Open-Meteo Air Quality Historical API.
- Weather: Open-Meteo Historical Forecast / Archive API:
  wind_speed_10m, wind_direction_10m, temperature_2m, relative_humidity_2m,
  precipitation, boundary_layer_height.
- Saves combined raw CSVs to ml/data/ (gitignored).
"""

from __future__ import annotations

import argparse
import os
from datetime import timedelta
from pathlib import Path

import pandas as pd

from collect_lib import (
    detect_server_today,
    fetch_open_meteo_pm25,
    fetch_open_meteo_weather,
    fetch_openaq_pm25,
)
from config import DATA_DIR, DELHI_STATIONS


def collect_all(years: float = 2.5, force: bool = False) -> list[Path]:
    """Downloads and merges PM2.5 + weather CSVs for all configured Delhi stations."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server_today = detect_server_today()
    end_date = server_today - timedelta(days=2)
    start_date = end_date - timedelta(days=int(round(years * 365)))
    openaq_key = os.getenv("OPENAQ_API_KEY", "").strip()

    pm25_source_label = (
        "OpenAQ v3 -> Open-Meteo fallback" if openaq_key else "Open-Meteo Air Quality Historical"
    )
    print(
        f"[collect] Collecting {years:.1f} years ({start_date} -> {end_date}) "
        f"for {len(DELHI_STATIONS)} Delhi locations (PM2.5 source: {pm25_source_label})"
    )

    saved_paths: list[Path] = []
    for station in DELHI_STATIONS:
        out_path = DATA_DIR / f"{station.id}.csv"
        if out_path.exists() and not force:
            print(f"[collect] Reusing existing {out_path.name}")
            saved_paths.append(out_path)
            continue

        print(f"[collect] Fetching {station.name} ({station.lat}, {station.lon})...")
        pm_df = None
        pm_source = "open_meteo"
        if openaq_key:
            pm_df = fetch_openaq_pm25(station, start_date, end_date, openaq_key)
            if pm_df is not None:
                pm_source = "openaq_v3"
        if pm_df is None:
            pm_df = fetch_open_meteo_pm25(station, start_date, end_date)

        wx_df = fetch_open_meteo_weather(station, start_date, end_date)
        merged = pd.merge(pm_df, wx_df, on="timestamp", how="inner")
        merged["location_id"] = station.id
        merged["location_name"] = station.name
        merged["lat"] = station.lat
        merged["lon"] = station.lon
        merged["pm25_source"] = pm_source

        merged.to_csv(out_path, index=False)
        print(
            f"[collect] Saved {out_path.name}: {len(merged):,} rows "
            f"({merged['timestamp'].min()} -> {merged['timestamp'].max()}, source={pm_source})"
        )
        saved_paths.append(out_path)

    return saved_paths


def main() -> None:
    """CLI entry point for historical data collection."""
    parser = argparse.ArgumentParser(description="Collect Delhi PM2.5 + weather history.")
    parser.add_argument("--years", type=float, default=2.5, help="Years of history (default 2.5)")
    parser.add_argument("--force", action="store_true", help="Re-download even if CSV exists")
    args = parser.parse_args()
    collect_all(years=args.years, force=args.force)


if __name__ == "__main__":
    main()
