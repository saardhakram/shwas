"""OpenAQ v3 and Open-Meteo historical PM2.5 + weather downloaders."""

from __future__ import annotations

import time
from datetime import date

import pandas as pd

from config import IST_TZ, StationConfig

from .http import (
    OPEN_METEO_AQ_URL,
    OPEN_METEO_ARCHIVE_URL,
    OPEN_METEO_HIST_FORECAST_URL,
    OPENAQ_V3_BASE,
    WEATHER_VARS,
    date_chunks,
    request_json,
)


def fetch_openaq_pm25(
    station: StationConfig, start: date, end: date, api_key: str
) -> pd.DataFrame | None:
    """Attempts to download hourly PM2.5 from nearest OpenAQ v3 CPCB station."""
    headers = {"X-API-Key": api_key}
    try:
        loc_data = request_json(
            f"{OPENAQ_V3_BASE}/locations",
            params={
                "coordinates": f"{station.lat},{station.lon}",
                "radius": 10000,
                "parameters_id": 2,
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
        for c_start, c_end in date_chunks(start, end, chunk_days=90):
            page = 1
            while page <= 15:
                payload = request_json(
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
                f"[collect] OpenAQ returned only {len(rows)} rows for {station.name}; "
                "falling back to Open-Meteo."
            )
            return None

        df = pd.DataFrame(rows)
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(IST_TZ)
        df["timestamp"] = df["timestamp"].dt.floor("h")
        return df.groupby("timestamp", as_index=False)["pm25"].mean()
    except Exception as exc:
        print(f"[collect] OpenAQ v3 failed for {station.name} ({exc}); falling back to Open-Meteo.")
        return None


def fetch_open_meteo_pm25(station: StationConfig, start: date, end: date) -> pd.DataFrame:
    """Downloads hourly PM2.5 from Open-Meteo Air Quality historical API."""
    frames: list[pd.DataFrame] = []
    for c_start, c_end in date_chunks(start, end, chunk_days=180):
        data = request_json(
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
    return df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp")


def fetch_open_meteo_weather(station: StationConfig, start: date, end: date) -> pd.DataFrame:
    """Downloads hourly weather including boundary_layer_height.

    Uses Open-Meteo Historical Forecast API (which exposes boundary_layer_height)
    and supplements any missing variables from the ERA5 Archive API.
    """
    frames: list[pd.DataFrame] = []
    for c_start, c_end in date_chunks(start, end, chunk_days=180):
        try:
            data = request_json(
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
                f"[collect] Historical-forecast API chunk {c_start}..{c_end} failed ({exc}); "
                "using archive API."
            )

        archive_vars = [v for v in WEATHER_VARS if v != "boundary_layer_height"]
        data = request_json(
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
    return df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp")
