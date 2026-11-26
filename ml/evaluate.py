"""Evaluate Shwas Forecast LightGBM model vs Persistence and Same-Hour-Yesterday baselines.

Produces:
- ml/reports/metrics.md (honest comparison table, horizon breakdown, winner callout)
- ml/reports/predicted_vs_actual.png
- ml/reports/error_by_horizon.png
- ml/reports/shap_importance.png
- src/data/mlMetrics.json (synced MAE/RMSE summary for the frontend ML badge)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import joblib
import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from config import FRONTEND_METRICS_JSON, MODEL_DIR, MODEL_VERSION, REPORTS_DIR
from features import FEATURE_COLUMNS, pm25_to_aqi_category, time_split
from train import load_all_station_datasets


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

    # Left: 7-day winter timeseries at 6h horizon for first station
    station_0 = df["location_id"].iloc[0]
    sub = (
        df[(df["location_id"] == station_0) & (df["horizon"] == 6)]
        .sort_values("target_time")
        .iloc[:84]  # ~7 days at 2h stride
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

    # Right: Predicted vs Actual scatter (subsampled for crisp rendering)
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


def main() -> None:
    """Evaluates the trained LightGBM model against baselines and writes reports/charts."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / "shwas_lgbm.joblib"
    meta_path = MODEL_DIR / "metadata.json"

    model = joblib.load(model_path)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    dataset = load_all_station_datasets(stride_hours=2)
    _, _, test_df = time_split(dataset)

    y_true = test_df["y"].to_numpy(dtype=float)
    y_lgbm = np.clip(model.predict(test_df[FEATURE_COLUMNS]), 0.0, None)
    y_persist = test_df["baseline_persistence"].to_numpy(dtype=float)
    y_same_hr = test_df["baseline_same_hour_yesterday"].to_numpy(dtype=float)

    m_lgbm = compute_metrics(y_true, y_lgbm)
    m_persist = compute_metrics(y_true, y_persist)
    m_same_hr = compute_metrics(y_true, y_same_hr)

    # Error by horizon (1..48)
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
    horizon_df = pd.DataFrame(horizon_rows)

    # Bucketed horizon table
    buckets = [(1, 6), (7, 12), (13, 24), (25, 48)]
    bucket_rows: list[dict] = []
    for h_lo, h_hi in buckets:
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

    # Generate plots
    plot_predicted_vs_actual(test_df, y_lgbm)
    plot_error_by_horizon(horizon_df)
    top_shap = plot_shap_importance(model, test_df)

    # Honest winner determination
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

    # Check if any horizon bucket was won by a baseline
    baseline_buckets = [r["bucket"] for r in bucket_rows if r["winner"] != "Shwas ML (LightGBM)"]
    if baseline_buckets and overall_winner == "Shwas ML (LightGBM)":
        verdict += (
            f" Note: a simple baseline slightly outperformed LightGBM on horizon bucket(s): "
            f"{', '.join(baseline_buckets)}."
        )

    # Build metrics.md
    test_start_str, test_end_str = meta["splits"]["test_range"]
    test_rows = meta["splits"]["test_rows"]
    lines = [
        "# Shwas Forecast (ML) — Evaluation Report",
        "",
        f"- **Model:** `{MODEL_VERSION}` (LightGBM Regressor with horizon 1–48h as a feature)",
        f"- **Evaluated at:** {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
        (
            f"- **Held-out Test Split (Latest Winter):** `{test_start_str}` → `{test_end_str}` "
            f"({test_rows:,} forecast rows across 3 Delhi stations)"
        ),
        "",
        "## Overall Test Metrics (1–48h)",
        "",
        "| Model | MAE (µg/m³) | RMSE (µg/m³) | AQI Category Accuracy |",
        "|---|---:|---:|---:|",
        (
            f"| **Shwas ML (LightGBM)** | **{m_lgbm['mae']:.2f}** | "
            f"**{m_lgbm['rmse']:.2f}** | **{m_lgbm['aqi_category_accuracy_pct']:.1f}%** |"
        ),
        (
            f"| Baseline: Persistence (next = now) | {m_persist['mae']:.2f} | "
            f"{m_persist['rmse']:.2f} | {m_persist['aqi_category_accuracy_pct']:.1f}% |"
        ),
        (
            f"| Baseline: Same-Hour Yesterday | {m_same_hr['mae']:.2f} | "
            f"{m_same_hr['rmse']:.2f} | {m_same_hr['aqi_category_accuracy_pct']:.1f}% |"
        ),
        "",
        verdict,
        "",
        "## MAE by Forecast Horizon (µg/m³)",
        "",
        "| Horizon Bucket | Shwas ML (LightGBM) | Persistence | Same-Hour Yesterday | Best |",
        "|---|---:|---:|---:|---|",
    ]
    for r in bucket_rows:
        lines.append(
            f"| {r['bucket']} | {r['lgbm_mae']:.2f} | {r['persistence_mae']:.2f} | "
            f"{r['same_hour_mae']:.2f} | {r['winner']} |"
        )

    lines += [
        "",
        "## Top Features (Mean |SHAP| µg/m³)",
        "",
        "| Rank | Feature | Mean \\|SHAP\\| (µg/m³) |",
        "|---:|---|---:|",
    ]
    for rank, (fname, fval) in enumerate(top_shap[:10], start=1):
        lines.append(f"| {rank} | `{fname}` | {fval:.2f} |")

    lines += [
        "",
        "## Charts",
        "",
        "![Predicted vs Actual](predicted_vs_actual.png)",
        "![Error by Horizon](error_by_horizon.png)",
        "![SHAP Feature Importance](shap_importance.png)",
        "",
    ]

    metrics_md_path = REPORTS_DIR / "metrics.md"
    metrics_md_path.write_text("\n".join(lines), encoding="utf-8")

    # Update metadata.json with test_mae and sync frontend JSON
    meta["test_mae"] = m_lgbm["mae"]
    meta["test_rmse"] = m_lgbm["rmse"]
    meta["aqi_category_accuracy_pct"] = m_lgbm["aqi_category_accuracy_pct"]
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    FRONTEND_METRICS_JSON.parent.mkdir(parents=True, exist_ok=True)
    frontend_summary = {
        "modelVersion": MODEL_VERSION,
        "mae": m_lgbm["mae"],
        "rmse": m_lgbm["rmse"],
        "aqiCategoryAccuracyPct": m_lgbm["aqi_category_accuracy_pct"],
        "persistenceMae": m_persist["mae"],
        "sameHourYesterdayMae": m_same_hr["mae"],
        "evaluatedAt": datetime.now(UTC).isoformat(),
    }
    FRONTEND_METRICS_JSON.write_text(json.dumps(frontend_summary, indent=2), encoding="utf-8")

    print(f"[evaluate] Wrote {metrics_md_path}, charts, and {FRONTEND_METRICS_JSON}")
    print(
        f"[evaluate] LightGBM MAE={m_lgbm['mae']:.2f} | "
        f"Persistence MAE={m_persist['mae']:.2f} | "
        f"Same-Hr MAE={m_same_hr['mae']:.2f}"
    )


if __name__ == "__main__":
    main()
