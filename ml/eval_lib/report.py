"""Markdown evaluation report builder and JSON artifact writers."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from config import FRONTEND_METRICS_JSON, MODEL_VERSION, REPORTS_DIR


def build_metrics_markdown(
    meta: dict,
    m_lgbm: dict[str, float],
    m_persist: dict[str, float],
    m_same_hr: dict[str, float],
    bucket_rows: list[dict],
    top_shap: list[tuple[str, float]],
    verdict: str,
) -> str:
    """Builds the Markdown evaluation summary saved to ml/reports/metrics.md."""
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
    for row in bucket_rows:
        lines.append(
            f"| {row['bucket']} | {row['lgbm_mae']:.2f} | {row['persistence_mae']:.2f} | "
            f"{row['same_hour_mae']:.2f} | {row['winner']} |"
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
    return "\n".join(lines)


def write_evaluation_outputs(
    meta: dict,
    meta_path: Path,
    markdown_report: str,
    m_lgbm: dict[str, float],
    m_persist: dict[str, float],
    m_same_hr: dict[str, float],
) -> Path:
    """Writes metrics.md, updates model metadata.json, and syncs frontend mlMetrics.json."""
    metrics_md_path = REPORTS_DIR / "metrics.md"
    metrics_md_path.write_text(markdown_report, encoding="utf-8")

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
    return metrics_md_path
