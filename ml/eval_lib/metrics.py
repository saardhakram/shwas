"""Metric computation, horizon breakdown, and verdict logic for model evaluation."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from features import pm25_to_aqi_category

HORIZON_BUCKETS: tuple[tuple[int, int], ...] = ((1, 6), (7, 12), (13, 24), (25, 48))


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Computes MAE, RMSE, and 6-class US AQI category accuracy percentage."""
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(root_mean_squared_error(y_true, y_pred))
    true_cat = pm25_to_aqi_category(y_true)
    pred_cat = pm25_to_aqi_category(y_pred)
    cat_acc = float(np.mean(true_cat == pred_cat) * 100.0)
    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "aqi_category_accuracy_pct": round(cat_acc, 1),
    }


def compute_horizon_metrics(
    test_df: pd.DataFrame,
    y_true: np.ndarray,
    y_lgbm: np.ndarray,
    y_persist: np.ndarray,
    y_same_hr: np.ndarray,
) -> pd.DataFrame:
    """Computes per-horizon MAE across forecast hours 1..48."""
    horizon_rows: list[dict] = []
    for h in range(1, 49):
        mask = (test_df["horizon"] == h).to_numpy()
        if not np.any(mask):
            continue
        horizon_rows.append(
            {
                "horizon": h,
                "lgbm_mae": round(float(mean_absolute_error(y_true[mask], y_lgbm[mask])), 2),
                "persistence_mae": round(
                    float(mean_absolute_error(y_true[mask], y_persist[mask])), 2
                ),
                "same_hour_mae": round(
                    float(mean_absolute_error(y_true[mask], y_same_hr[mask])), 2
                ),
            }
        )
    return pd.DataFrame(horizon_rows)


def compute_bucket_metrics(
    test_df: pd.DataFrame,
    y_true: np.ndarray,
    y_lgbm: np.ndarray,
    y_persist: np.ndarray,
    y_same_hr: np.ndarray,
) -> list[dict]:
    """Computes MAE and winning model for each forecast horizon bucket."""
    bucket_rows: list[dict] = []
    for h_lo, h_hi in HORIZON_BUCKETS:
        mask = ((test_df["horizon"] >= h_lo) & (test_df["horizon"] <= h_hi)).to_numpy()
        lgbm_b = round(float(mean_absolute_error(y_true[mask], y_lgbm[mask])), 2)
        pers_b = round(float(mean_absolute_error(y_true[mask], y_persist[mask])), 2)
        same_b = round(float(mean_absolute_error(y_true[mask], y_same_hr[mask])), 2)
        best_name = min(
            [
                ("Shwas ML (LightGBM)", lgbm_b),
                ("Persistence", pers_b),
                ("Same-Hour Yesterday", same_b),
            ],
            key=lambda x: x[1],
        )[0]
        bucket_rows.append(
            {
                "bucket": f"{h_lo}–{h_hi}h",
                "lgbm_mae": lgbm_b,
                "persistence_mae": pers_b,
                "same_hour_mae": same_b,
                "winner": best_name,
            }
        )
    return bucket_rows


def build_verdict(
    m_lgbm: dict[str, float],
    m_persist: dict[str, float],
    m_same_hr: dict[str, float],
    bucket_rows: list[dict],
) -> str:
    """Formats an honest comparison verdict between LightGBM and simple baselines."""
    overall_scores = [
        ("Shwas ML (LightGBM)", m_lgbm["mae"]),
        ("Persistence (Next = Now)", m_persist["mae"]),
        ("Same-Hour Yesterday", m_same_hr["mae"]),
    ]
    overall_winner = min(overall_scores, key=lambda x: x[1])[0]
    best_baseline_mae = min(m_persist["mae"], m_same_hr["mae"])
    improvement_pct = round(((best_baseline_mae - m_lgbm["mae"]) / best_baseline_mae) * 100.0, 1)

    if overall_winner == "Shwas ML (LightGBM)":
        verdict = (
            f"**Winner: Shwas ML (LightGBM)** — beats the strongest baseline by "
            f"**{improvement_pct:+.1f}%** MAE "
            f"({m_lgbm['mae']:.2f} vs {best_baseline_mae:.2f} µg/m³) "
            f"on the held-out latest winter test set."
        )
    else:
        verdict = (
            f"**Honest result: {overall_winner} wins overall on MAE** "
            f"({best_baseline_mae:.2f} vs LightGBM {m_lgbm['mae']:.2f} µg/m³). "
            f"See horizon breakdown below for where ML vs baselines perform best."
        )

    baseline_buckets = [r["bucket"] for r in bucket_rows if r["winner"] != "Shwas ML (LightGBM)"]
    if baseline_buckets and overall_winner == "Shwas ML (LightGBM)":
        verdict += (
            f" Note: a simple baseline slightly outperformed LightGBM on horizon bucket(s): "
            f"{', '.join(baseline_buckets)}."
        )
    return verdict
