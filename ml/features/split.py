"""Strict chronological train/validation/test splitting with temporal embargo."""

from __future__ import annotations

import pandas as pd

from config import IST_TZ


def time_split(
    dataset: pd.DataFrame,
    embargo_hours: int = 48,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Splits dataset strictly by TIME only (origin_time) with a 48h embargo between splits.

    Targets testing on the latest complete winter season (Nov 1 -> Feb 15 of the most recent
    winter present in the dataset), validating on the ~3.5 months preceding it, and training
    on all older data (including prior winters). Falls back to 70/15/15 chronological split
    if the dataset spans less than 12 months.
    """
    df = dataset.sort_values("origin_time").reset_index(drop=True)
    min_t = df["origin_time"].min()
    max_t = df["origin_time"].max()
    total_days = (max_t - min_t).total_seconds() / 86400.0
    embargo = pd.Timedelta(hours=embargo_hours)

    if total_days >= 400:
        candidate_nov_year = max_t.year if max_t.month >= 11 else max_t.year - 1
        test_start = pd.Timestamp(year=candidate_nov_year, month=11, day=1, tz=IST_TZ)
        if (max_t - test_start).days < 60:
            test_start = pd.Timestamp(year=candidate_nov_year - 1, month=11, day=1, tz=IST_TZ)

        test_end = min(max_t, test_start + pd.Timedelta(days=110))
        val_end = test_start - embargo
        val_start = val_end - pd.Timedelta(days=105)
        train_end = val_start - embargo

        train = df[df["origin_time"] <= train_end].copy()
        val = df[(df["origin_time"] >= val_start) & (df["origin_time"] <= val_end)].copy()
        test = df[(df["origin_time"] >= test_start) & (df["origin_time"] <= test_end)].copy()

        if len(train) > 500 and len(val) > 200 and len(test) > 200:
            return train, val, test

    unique_times = df["origin_time"].sort_values().unique()
    n = len(unique_times)
    t_train_end = pd.Timestamp(unique_times[int(n * 0.70)])
    t_val_start = t_train_end + embargo
    t_val_end = pd.Timestamp(unique_times[int(n * 0.85)])
    t_test_start = t_val_end + embargo

    train = df[df["origin_time"] <= t_train_end].copy()
    val = df[(df["origin_time"] >= t_val_start) & (df["origin_time"] <= t_val_end)].copy()
    test = df[df["origin_time"] >= t_test_start].copy()
    return train, val, test
