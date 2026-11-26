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
import email.utils
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

from config import DATA_DIR, DELHI_STATIONS, IST_TZ, StationConfig

OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_HIST_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPENAQ_V3_BASE = "https://api.openaq.org/v3"

WEATHER_VARS = [
    "wind_speed_10m",
    "wind_direction_10m",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
]


def detect_server_today() -> date:
    """Detects real UTC date from Open-Meteo HTTP Date header so local clock skew never breaks queries."""
    try:
        resp = requests.get(
            OPEN_METEO_AQ_URL,
            params={
                "latitude": 28.6139,
                "longitude": 77.2090,
                "hourly": "pm2_5",
                "forecast_days": 1,
            },
            timeout=15,
        )
        date_hdr = resp.headers.get("Date")
        if date_hdr:
            parsed = email.utils.parsedate_to_datetime(date_hdr)
            return parsed.date()
    except Exception:
        pass
    return date.today()


def _date_chunks(start: date, end: date, chunk_days: int = 180) -> list[tuple[date, date]]:
    chunks: list[tuple[date, date]] = []
    cur = start
    while cur <= end:
        nxt = min(end, cur + timedelta(days=chunk_days - 1))
        chunks.append((cur, nxt))
        cur = nxt + timedelta(days=1)
    return chunks


def _request_json(url: str, params: dict, headers: dict | None = None, retries: int = 3) -> dict:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=45)
            if resp.status_code == 429:
                time.sleep(2 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Request failed for {url}: {last_err}")


def fetch_openaq_pm25(
    station: StationConfig, start: date, end: date, api_key: str
) -> pd.DataFrame | None:
    """Attempts to download hourly PM2.5 from nearest OpenAQ v3 CPCB station."""
    headers = {"X-API-Key": api_key}
    try:
        loc_data = _request_json(
            f"{OPENAQ_V3_BASE}/locations",
            params={
                "coordinates": f"{station.lat},{station.lon}",
                "radius": 10000,
                "parameters_id": 2,  # PM2.5
                "limit": 5,
            },
            headers=headers,
        )
        results = loc_data.get("results") or []
        sensor_id = None
        for loc in results:
            for sensor in loc.get("sensors") or []:
                param = sensor.get("parameter") or {}
                if param.get("name") == "pm25" or param.get("id") == 2:
                    sensor_id = sensor.get("id")
                    break
            if sensor_id is not None:
                break

        if sensor_id is None:
            print(f"[collect] No OpenAQ v3 PM2.5 sensor near {station.name}; using Open-Meteo.")
            return None

        rows: list[dict] = []
        for c_start, c_end in _date_chunks(start, end, chunk_days=90):
            page = 1
            while page <= 15:
                payload = _request_json(
                    f"{OPENAQ_V3_BASE}/sensors/{sensor_id}/hours",
                    params={
                        "datetime_from": f"{c_start.isoformat()}T00:00:00Z",
                        "datetime_to": f"{c_end.isoformat()}T23:59:59Z",
                        "limit": 1000,
                        "page": page,
                    },
                    headers=headers,
                )
                batch = payload.get("results") or []
                if not batch:
                    break
                for item in batch:
                    period = item.get("period") or {}
                    dt_from = (period.get("datetimeFrom") or {}).get("utc")
                    val = item.get("value")
                    if dt_from is not None and val is not None:
                        rows.append({"timestamp": dt_from, "pm25": float(val)})
                if len(batch) < 1000:
                    break
                page += 1

        if len(rows) < 24 * 180:
            print(
                f"[collect] OpenAQ returned only {len(rows)} rows for {station.name}; falling back to Open-Meteo."
            )
            return None

        df = pd.DataFrame(rows)
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(IST_TZ)
        df["timestamp"] = df["timestamp"].dt.floor("h")
        df = df.groupby("timestamp", as_index=False)["pm25"].mean()
        return df
    except Exception as exc:
        print(f"[collect] OpenAQ v3 failed for {station.name} ({exc}); falling back to Open-Meteo.")
        return None


def fetch_open_meteo_pm25(station: StationConfig, start: date, end: date) -> pd.DataFrame:
    """Downloads hourly PM2.5 from Open-Meteo Air Quality historical API."""
    frames: list[pd.DataFrame] = []
    for c_start, c_end in _date_chunks(start, end, chunk_days=180):
        data = _request_json(
            OPEN_METEO_AQ_URL,
            params={
                "latitude": station.lat,
                "longitude": station.lon,
                "hourly": "pm2_5",
                "start_date": c_start.isoformat(),
                "end_date": c_end.isoformat(),
                "timezone": IST_TZ,
            },
        )
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        vals = hourly.get("pm2_5") or []
        if times:
            frames.append(pd.DataFrame({"timestamp": times, "pm25": vals}))
        time.sleep(0.25)

    if not frames:
        raise RuntimeError(f"No PM2.5 data downloaded for {station.name}")

    df = pd.concat(frames, ignore_index=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.tz_localize(
        IST_TZ, ambiguous="infer", nonexistent="shift_forward"
    )
    df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp")
    return df


def fetch_open_meteo_weather(station: StationConfig, start: date, end: date) -> pd.DataFrame:
    """Downloads hourly weather including boundary_layer_height.

    Uses Open-Meteo Historical Forecast API (which exposes boundary_layer_height)
    and supplements any missing variables from the ERA5 Archive API.
    """
    frames: list[pd.DataFrame] = []
    for c_start, c_end in _date_chunks(start, end, chunk_days=180):
        try:
            data = _request_json(
                OPEN_METEO_HIST_FORECAST_URL,
                params={
                    "latitude": station.lat,
                    "longitude": station.lon,
                    "hourly": ",".join(WEATHER_VARS),
                    "start_date": c_start.isoformat(),
                    "end_date": c_end.isoformat(),
                    "timezone": IST_TZ,
                },
            )
            hourly = data.get("hourly") or {}
            if hourly.get("time"):
                frame = pd.DataFrame({"timestamp": hourly["time"]})
                for var in WEATHER_VARS:
                    frame[var] = hourly.get(var)
                frames.append(frame)
                time.sleep(0.25)
                continue
        except Exception as exc:
            print(
                f"[collect] Historical-forecast API chunk {c_start}..{c_end} failed ({exc}); using archive API."
            )

        # Fallback to ERA5 Archive API (without boundary_layer_height if unsupported)
        archive_vars = [v for v in WEATHER_VARS if v != "boundary_layer_height"]
        data = _request_json(
            OPEN_METEO_ARCHIVE_URL,
            params={
                "latitude": station.lat,
                "longitude": station.lon,
                "hourly": ",".join(archive_vars),
                "start_date": c_start.isoformat(),
                "end_date": c_end.isoformat(),
                "timezone": IST_TZ,
            },
        )
        hourly = data.get("hourly") or {}
        if hourly.get("time"):
            frame = pd.DataFrame({"timestamp": hourly["time"]})
            for var in archive_vars:
                frame[var] = hourly.get(var)
            frame["boundary_layer_height"] = pd.NA
            frames.append(frame)
        time.sleep(0.25)

    if not frames:
        raise RuntimeError(f"No weather data downloaded for {station.name}")

    df = pd.concat(frames, ignore_index=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.tz_localize(
        IST_TZ, ambiguous="infer", nonexistent="shift_forward"
    )
    df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp")
    return df


def collect_all(years: float = 2.5, force: bool = False) -> list[Path]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server_today = detect_server_today()
    end_date = server_today - timedelta(days=2)
    start_date = end_date - timedelta(days=int(round(years * 365)))
    openaq_key = os.getenv("OPENAQ_API_KEY", "").strip()

    print(
        f"[collect] Collecting {years:.1f} years ({start_date} -> {end_date}) "
        f"for {len(DELHI_STATIONS)} Delhi locations "
        f"(PM2.5 source: {'OpenAQ v3 -> Open-Meteo fallback' if openaq_key else 'Open-Meteo Air Quality Historical'})"
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
    parser = argparse.ArgumentParser(description="Collect Delhi PM2.5 + weather history.")
    parser.add_argument("--years", type=float, default=2.5, help="Years of history (default 2.5)")
    parser.add_argument("--force", action="store_true", help="Re-download even if CSV exists")
    args = parser.parse_args()
    collect_all(years=args.years, force=args.force)


if __name__ == "__main__":
    main()

