"""Train Shwas Forecast LightGBM model with horizon (1-48h) as a feature.

- Loads raw station CSVs from ml/data/
- Cleans & builds multi-horizon features
- Splits strictly by TIME (older winters -> train, preceding period -> val, latest winter -> test)
- Performs light hyperparameter tuning on VALIDATION set ONLY
- Saves best model and metadata to ml/model/
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from config import DATA_DIR, DELHI_STATIONS, MODEL_DIR, MODEL_VERSION
from features import (
    FEATURE_COLUMNS,
    add_origin_features,
    build_horizon_dataset,
    clean_station_df,
    time_split,
)


def load_all_station_datasets(stride_hours: int = 2) -> pd.DataFrame:
    """Loads, cleans, and combines collected Delhi station CSVs into one multi-horizon dataset."""
    frames: list[pd.DataFrame] = []
    for idx, station in enumerate(DELHI_STATIONS):
        csv_path = DATA_DIR / f"{station.id}.csv"
        if not csv_path.exists():
            raise FileNotFoundError(
                f"Missing data file {csv_path}. Run `python ml/collect.py` first."
            )
        raw = pd.read_csv(csv_path)
        cleaned = clean_station_df(raw)
        featured = add_origin_features(cleaned, location_idx=idx)
        horizon_df = build_horizon_dataset(featured, stride_hours=stride_hours)
        frames.append(horizon_df)
        print(
            f"[train] {station.name}: {len(cleaned):,} clean hourly rows -> "
            f"{len(horizon_df):,} supervised rows"
        )

    return pd.concat(frames, ignore_index=True)


def tune_and_train(
    train_df: pd.DataFrame, val_df: pd.DataFrame
) -> tuple[lgb.LGBMRegressor, dict, float]:
    """Light hyperparameter search evaluated strictly on the temporal validation set."""
    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["y"].to_numpy(dtype=float)
    X_val = val_df[FEATURE_COLUMNS]
    y_val = val_df["y"].to_numpy(dtype=float)

    candidates = [
        {
            "learning_rate": 0.05,
            "num_leaves": 31,
            "min_child_samples": 40,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
        },
        {
            "learning_rate": 0.05,
            "num_leaves": 63,
            "min_child_samples": 50,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
        },
        {
            "learning_rate": 0.03,
            "num_leaves": 47,
            "min_child_samples": 60,
            "subsample": 0.8,
            "colsample_bytree": 0.75,
        },
        {
            "learning_rate": 0.05,
            "num_leaves": 31,
            "min_child_samples": 80,
            "subsample": 0.8,
            "colsample_bytree": 0.75,
            "reg_alpha": 1.0,
            "reg_lambda": 2.0,
        },
    ]

    best_model: lgb.LGBMRegressor | None = None
    best_params: dict = {}
    best_val_mae = float("inf")

    for i, params in enumerate(candidates, start=1):
        model = lgb.LGBMRegressor(
            objective="regression_l1",  # Optimize MAE directly
            n_estimators=800,
            random_state=42,
            n_jobs=-1,
            verbose=-1,
            **params,
        )
        model.fit(
            X_train,
            y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(stopping_rounds=40, verbose=False)],
        )
        preds = np.clip(model.predict(X_val), 0.0, None)
        val_mae = float(mean_absolute_error(y_val, preds))
        print(
            f"[train] Candidate {i}/{len(candidates)} {params} -> "
            f"val MAE = {val_mae:.2f} µg/m³ (best_iter={model.best_iteration_})"
        )
        if val_mae < best_val_mae:
            best_val_mae = val_mae
            best_model = model
            best_params = {**params, "best_iteration": int(model.best_iteration_ or 200)}

    assert best_model is not None
    return best_model, best_params, best_val_mae


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # Use 2h origin stride so 3 stations x 2.5y x 48h stays compact (~750k rows) and trains <60s
    dataset = load_all_station_datasets(stride_hours=2)
    train_df, val_df, test_df = time_split(dataset)

    tr_min, tr_max = train_df["origin_time"].min(), train_df["origin_time"].max()
    va_min, va_max = val_df["origin_time"].min(), val_df["origin_time"].max()
    te_min, te_max = test_df["origin_time"].min(), test_df["origin_time"].max()
    print(
        f"[train] Temporal split:\n"
        f"  Train: {len(train_df):,} rows ({tr_min} -> {tr_max})\n"
        f"  Val:   {len(val_df):,} rows ({va_min} -> {va_max})\n"
        f"  Test:  {len(test_df):,} rows ({te_min} -> {te_max})"
    )

    assert train_df["origin_time"].max() < val_df["origin_time"].min(), (
        "Temporal leakage train->val!"
    )
    assert val_df["origin_time"].max() < test_df["origin_time"].min(), "Temporal leakage val->test!"

    best_model, best_params, best_val_mae = tune_and_train(train_df, val_df)

    model_path = MODEL_DIR / "shwas_lgbm.joblib"
    joblib.dump(best_model, model_path)

    metadata = {
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(UTC).isoformat(),
        "feature_columns": FEATURE_COLUMNS,
        "best_params": best_params,
        "val_mae": round(best_val_mae, 2),
        "stations": [
            {"idx": i, "id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon}
            for i, s in enumerate(DELHI_STATIONS)
        ],
        "splits": {
            "train_rows": int(len(train_df)),
            "val_rows": int(len(val_df)),
            "test_rows": int(len(test_df)),
            "train_range": [str(train_df["origin_time"].min()), str(train_df["origin_time"].max())],
            "val_range": [str(val_df["origin_time"].min()), str(val_df["origin_time"].max())],
            "test_range": [str(test_df["origin_time"].min()), str(test_df["origin_time"].max())],
        },
    }
    meta_path = MODEL_DIR / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"[train] Saved model to {model_path} and metadata to {meta_path}")


if __name__ == "__main__":
    main()
