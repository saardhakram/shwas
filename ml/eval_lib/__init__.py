"""Evaluation helpers (metrics, charts, and reports) for Shwas Forecast ML."""

from __future__ import annotations

from .metrics import (
    build_verdict,
    compute_bucket_metrics,
    compute_horizon_metrics,
    compute_metrics,
)
from .plots import (
    plot_error_by_horizon,
    plot_predicted_vs_actual,
    plot_shap_importance,
)
from .report import build_metrics_markdown, write_evaluation_outputs

__all__ = [
    "build_metrics_markdown",
    "build_verdict",
    "compute_bucket_metrics",
    "compute_horizon_metrics",
    "compute_metrics",
    "plot_error_by_horizon",
    "plot_predicted_vs_actual",
    "plot_shap_importance",
    "write_evaluation_outputs",
]
