"""US EPA PM2.5 to AQI numeric and category conversion helpers."""

from __future__ import annotations

import numpy as np
import pandas as pd

_EPA_PM25_BREAKPOINTS: tuple[tuple[float, float, int, int], ...] = (
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
)

_AQI_BINS = [-np.inf, 12.0, 35.4, 55.4, 150.4, 250.4, np.inf]
_AQI_LABELS = ["Good", "Moderate", "Poor", "Very Poor", "Severe", "Hazardous"]


def pm25_to_us_aqi(pm25: float) -> int:
    """Standard US EPA PM2.5 (µg/m³) -> US AQI linear breakpoint conversion."""
    c = max(0.0, float(pm25))
    c_trunc = np.floor(c * 10.0) / 10.0
    for c_low, c_high, i_low, i_high in _EPA_PM25_BREAKPOINTS:
        if c_trunc <= c_high:
            return int(round(((i_high - i_low) / (c_high - c_low)) * (c_trunc - c_low) + i_low))
    return 500


def pm25_to_aqi_category(pm25: np.ndarray | pd.Series | float) -> np.ndarray | str:
    """Maps PM2.5 (µg/m³) to 6 standard AQI categories (Good -> Hazardous)."""
    if np.isscalar(pm25):
        val = float(pm25)
        for upper, label in zip(_AQI_BINS[1:], _AQI_LABELS, strict=True):
            if val <= upper:
                return label
        return "Hazardous"
    arr = np.asarray(pm25, dtype=float)
    cat = pd.cut(arr, bins=_AQI_BINS, labels=_AQI_LABELS, right=True)
    return cat.astype(str).to_numpy()
