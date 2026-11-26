"""Shared HTTP client helpers, date chunking, and endpoint constants for collection."""

from __future__ import annotations

import email.utils
import time
from datetime import date, timedelta

import requests

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
    """Detects real UTC date from Open-Meteo HTTP Date header to avoid local clock skew."""
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


def date_chunks(start: date, end: date, chunk_days: int = 180) -> list[tuple[date, date]]:
    """Splits an inclusive date range into consecutive chunks of at most `chunk_days` days."""
    chunks: list[tuple[date, date]] = []
    cur = start
    while cur <= end:
        nxt = min(end, cur + timedelta(days=chunk_days - 1))
        chunks.append((cur, nxt))
        cur = nxt + timedelta(days=1)
    return chunks


def request_json(url: str, params: dict, headers: dict | None = None, retries: int = 3) -> dict:
    """Performs an HTTP GET with simple exponential backoff for transient errors and 429s."""
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
