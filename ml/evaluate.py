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

import joblib
import numpy as np

from config import FRONTEND_METRICS_JSON, MODEL_DIR, REPORTS_DIR
from eval_lib import (
    build_metrics_markdown,
    build_verdict,
    compute_bucket_metrics,
    compute_horizon_metrics,
    compute_metrics,
    plot_error_by_horizon,
    plot_predicted_vs_actual,
    plot_shap_importance,
    write_evaluation_outputs,
)
from features import FEATURE_COLUMNS, time_split
from train import load_all_station_datasets


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

    horizon_df = compute_horizon_metrics(test_df, y_true, y_lgbm, y_persist, y_same_hr)
    bucket_rows = compute_bucket_metrics(test_df, y_true, y_lgbm, y_persist, y_same_hr)

    plot_predicted_vs_actual(test_df, y_lgbm)
    plot_error_by_horizon(horizon_df)
    top_shap = plot_shap_importance(model, test_df)

    verdict = build_verdict(m_lgbm, m_persist, m_same_hr, bucket_rows)
    markdown_report = build_metrics_markdown(
        meta, m_lgbm, m_persist, m_same_hr, bucket_rows, top_shap, verdict
    )
    metrics_md_path = write_evaluation_outputs(
        meta, meta_path, markdown_report, m_lgbm, m_persist, m_same_hr
    )

    print(f"[evaluate] Wrote {metrics_md_path}, charts, and {FRONTEND_METRICS_JSON}")
    print(
        f"[evaluate] LightGBM MAE={m_lgbm['mae']:.2f} | "
        f"Persistence MAE={m_persist['mae']:.2f} | "
        f"Same-Hr MAE={m_same_hr['mae']:.2f}"
    )


if __name__ == "__main__":
    main()
