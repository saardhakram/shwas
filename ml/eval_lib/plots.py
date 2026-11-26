"""Dark-themed diagnostic evaluation plots for Shwas Forecast ML."""

from __future__ import annotations

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap

from config import REPORTS_DIR
from features import FEATURE_COLUMNS


def _style_dark_axes(ax: plt.Axes) -> None:
    """Applies dark-theme colors and grid styling to a Matplotlib Axes object."""
    ax.set_facecolor("#111827")
    ax.tick_params(colors="#CBD5E1", labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#334155")
    ax.grid(color="#1E293B", linestyle="--", linewidth=0.7, alpha=0.8)


def plot_predicted_vs_actual(test_df: pd.DataFrame, preds: np.ndarray) -> None:
    """Plots a 7-day winter snippet (horizon=6h) + overall scatter."""
    df = test_df[
        ["origin_time", "target_time", "location_id", "horizon", "y", "baseline_persistence"]
    ].copy()
    df["pred"] = preds

    fig, axes = plt.subplots(1, 2, figsize=(13, 4.8), facecolor="#0B0F17")

    station_0 = df["location_id"].iloc[0]
    sub = (
        df[(df["location_id"] == station_0) & (df["horizon"] == 6)]
        .sort_values("target_time")
        .iloc[:84]
    )
    ax0 = axes[0]
    _style_dark_axes(ax0)
    ax0.plot(sub["target_time"], sub["y"], label="Actual PM2.5", color="#F8FAFC", linewidth=2.0)
    ax0.plot(
        sub["target_time"], sub["pred"], label="Shwas ML (LightGBM)", color="#2DD4BF", linewidth=1.8
    )
    ax0.plot(
        sub["target_time"],
        sub["baseline_persistence"],
        label="Persistence (Now)",
        color="#F59E0B",
        linestyle="--",
        linewidth=1.2,
        alpha=0.8,
    )
    ax0.set_title("Latest Winter Test Snippet (6h Horizon)", color="#F8FAFC", fontsize=11, pad=10)
    ax0.set_ylabel("PM2.5 (µg/m³)", color="#CBD5E1", fontsize=9)
    ax0.tick_params(axis="x", rotation=25)
    ax0.legend(facecolor="#0F172A", edgecolor="#334155", labelcolor="#E2E8F0", fontsize=8)

    rng = np.random.default_rng(42)
    idx = rng.choice(len(df), size=min(4000, len(df)), replace=False)
    ax1 = axes[1]
    _style_dark_axes(ax1)
    ax1.scatter(
        df["y"].iloc[idx], df["pred"].iloc[idx], s=8, alpha=0.35, color="#2DD4BF", edgecolors="none"
    )
    max_val = float(np.percentile(df["y"], 99))
    ax1.plot(
        [0, max_val],
        [0, max_val],
        color="#F59E0B",
        linestyle="--",
        linewidth=1.4,
        label="Ideal (y = x)",
    )
    ax1.set_xlim(0, max_val)
    ax1.set_ylim(0, max_val)
    ax1.set_xlabel("Actual PM2.5 (µg/m³)", color="#CBD5E1", fontsize=9)
    ax1.set_ylabel("Predicted PM2.5 (µg/m³)", color="#CBD5E1", fontsize=9)
    ax1.set_title("Predicted vs Actual (All Horizons 1–48h)", color="#F8FAFC", fontsize=11, pad=10)
    ax1.legend(facecolor="#0F172A", edgecolor="#334155", labelcolor="#E2E8F0", fontsize=8)

    plt.tight_layout()
    fig.savefig(REPORTS_DIR / "predicted_vs_actual.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def plot_error_by_horizon(horizon_df: pd.DataFrame) -> None:
    """Plots LightGBM vs baseline MAE across forecast horizons 1–48h."""
    fig, ax = plt.subplots(figsize=(9.5, 4.6), facecolor="#0B0F17")
    _style_dark_axes(ax)
    ax.plot(
        horizon_df["horizon"],
        horizon_df["lgbm_mae"],
        label="Shwas ML (LightGBM)",
        color="#2DD4BF",
        linewidth=2.4,
    )
    ax.plot(
        horizon_df["horizon"],
        horizon_df["persistence_mae"],
        label="Baseline: Persistence (Next = Now)",
        color="#F59E0B",
        linestyle="--",
        linewidth=1.8,
    )
    ax.plot(
        horizon_df["horizon"],
        horizon_df["same_hour_mae"],
        label="Baseline: Same-Hour Yesterday",
        color="#EF4444",
        linestyle=":",
        linewidth=1.8,
    )
    ax.set_xlabel("Forecast Horizon (hours ahead)", color="#CBD5E1", fontsize=10)
    ax.set_ylabel("Mean Absolute Error (µg/m³)", color="#CBD5E1", fontsize=10)
    ax.set_title(
        "Test MAE by Forecast Horizon (1–48 Hours, Latest Winter)",
        color="#F8FAFC",
        fontsize=12,
        pad=10,
    )
    ax.set_xticks([1, 6, 12, 18, 24, 30, 36, 42, 48])
    ax.legend(facecolor="#0F172A", edgecolor="#334155", labelcolor="#E2E8F0", fontsize=9)
    plt.tight_layout()
    fig.savefig(REPORTS_DIR / "error_by_horizon.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)


def plot_shap_importance(
    model: lgb.LGBMRegressor, test_df: pd.DataFrame
) -> list[tuple[str, float]]:
    """Computes and plots the top 15 mean absolute SHAP feature importances."""
    sample = test_df[FEATURE_COLUMNS].sample(n=min(1500, len(test_df)), random_state=42)
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(sample)
    mean_abs = np.abs(shap_values).mean(axis=0)
    order = np.argsort(mean_abs)[::-1]
    top_k = 15
    top_features = [(FEATURE_COLUMNS[i], float(mean_abs[i])) for i in order[:top_k]]

    fig, ax = plt.subplots(figsize=(9, 5.2), facecolor="#0B0F17")
    _style_dark_axes(ax)
    names = [f for f, _ in reversed(top_features)]
    vals = [v for _, v in reversed(top_features)]
    bars = ax.barh(names, vals, color="#2DD4BF", alpha=0.9)
    for bar, val in zip(bars, vals, strict=True):
        ax.text(
            val + max(vals) * 0.015,
            bar.get_y() + bar.get_height() / 2,
            f"{val:.1f}",
            va="center",
            color="#E2E8F0",
            fontsize=8,
        )
    ax.set_xlabel(
        "Mean |SHAP value| (µg/m³ impact on PM2.5 prediction)", color="#CBD5E1", fontsize=9
    )
    ax.set_title(
        "Shwas Forecast — Top 15 SHAP Feature Importances", color="#F8FAFC", fontsize=12, pad=10
    )
    ax.set_xlim(0, max(vals) * 1.15)
    plt.tight_layout()
    fig.savefig(REPORTS_DIR / "shap_importance.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    return top_features
