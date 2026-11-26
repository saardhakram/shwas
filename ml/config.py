"""Shared configuration for the Shwas Forecast ML pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_DIR = ML_DIR / "data"
MODEL_DIR = ML_DIR / "model"
REPORTS_DIR = ML_DIR / "reports"
FRONTEND_METRICS_JSON = REPO_ROOT / "src" / "data" / "mlMetrics.json"

IST_TZ = "Asia/Kolkata"
MODEL_VERSION = "shwas-lgbm-v1"
HORIZONS = list(range(1, 49))  # 1..48 hours ahead


@dataclass(frozen=True)
class StationConfig:
    id: str
    name: str
    lat: float
    lon: float


# 3 representative Delhi CPCB monitoring zones
DELHI_STATIONS: list[StationConfig] = [
    StationConfig(
        id="delhi_anand_vihar",
        name="Anand Vihar, Delhi",
        lat=28.6469,
        lon=77.3160,
    ),
    StationConfig(
        id="delhi_rk_puram",
        name="R.K. Puram, Delhi",
        lat=28.5633,
        lon=77.1869,
    ),
    StationConfig(
        id="delhi_ito",
        name="ITO, Central Delhi",
        lat=28.6289,
        lon=77.2405,
    ),
]

# Official Diwali dates (2021-2027); feature flag marks Diwali +/- 1 day for fireworks surge
DIWALI_DATES: set[date] = {
    date(2021, 11, 4),
    date(2022, 10, 24),
    date(2023, 11, 12),
    date(2024, 10, 31),
    date(2025, 10, 20),
    date(2026, 11, 8),
    date(2027, 10, 29),
}

