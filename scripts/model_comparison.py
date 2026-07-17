"""Layer 2 (part 1): trains and compares classifiers for eligible_sama.

Trains logistic regression, random forest, and gradient boosting models on
individuals_profiles.csv, compares them, and saves the best one (by F1-score,
tie-break ROC-AUC) plus its feature contract for the DiCE counterfactual engine.

FEATURE SET (rebuilt 2026-07-12 for the generated dataset): the model sees the persona's
income, its three obligation components, and the financing being requested. The two SAMA
ratios (salary_dbr, total_obligation_ratio) are included because they are what the label is
computed from -- which is also why the metrics are near-perfect: eligible_sama is a
deterministic function of those ratios and their caps. That is expected and explainable, not
a leak to hide; the classifier exists to give DiCE a differentiable surface to search, not to
discover an unknown pattern.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.base import ClassifierMixin
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    RocCurveDisplay,
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT_DIR = Path(__file__).resolve().parent.parent
PROFILES_CSV = ROOT_DIR / "data" / "processed" / "individuals_profiles.csv"
TARGET_COLUMN = "eligible_sama"
NUMERIC_FEATURE_COLUMNS = [
    "age",
    "gross_salary_sar",
    "mortgage_installment_sar",
    "other_loan_installments_sar",
    "credit_card_min_payment_sar",
    "requested_loan_amount_sar",
    "loan_int_rate",
    "new_loan_installment_sar",
    "salary_dbr",
    "total_obligation_ratio",
    "loan_percent_income",
]
CATEGORICAL_FEATURE_COLUMNS = ["employment_type", "housing_status"]
OUTPUT_DIR = ROOT_DIR / "output"
RANDOM_STATE = 42
TEST_SIZE = 0.2


def load_and_encode_data() -> tuple[pd.DataFrame, pd.Series]:
    """Loads the loan dataset and one-hot encodes its categorical features.

    Returns:
        A tuple of (X, y) where X is the fully numeric encoded feature
        matrix and y is the eligible_sama target series.
    """
    df = pd.read_csv(PROFILES_CSV)
    # Train ONLY on the requester cohort. eligible_sama means "approved for a requested loan" only
    # for requesters; non-requesters (has_active_request == 0) have no application, a NaN rate, and
    # a reinterpreted label ("within caps on existing obligations"), so they are not training
    # examples for the request-eligibility classifier. With this filter the training set is exactly
    # the original 1000 requester rows, so re-running reproduces the existing best_model.pkl.
    if "has_active_request" in df.columns:
        df = df[df["has_active_request"] == 1].reset_index(drop=True)
    encoded_df = pd.get_dummies(df, columns=CATEGORICAL_FEATURE_COLUMNS, drop_first=False)

    feature_columns = NUMERIC_FEATURE_COLUMNS + [
        column
        for column in encoded_df.columns
        if any(column.startswith(f"{categorical}_") for categorical in CATEGORICAL_FEATURE_COLUMNS)
    ]
    return encoded_df[feature_columns], df[TARGET_COLUMN]


def split_data(
    X: pd.DataFrame, y: pd.Series
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Splits data into stratified 80/20 train/test sets with a fixed seed."""
    return train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE
    )


def train_logistic_regression(X_train: pd.DataFrame, y_train: pd.Series) -> LogisticRegression:
    """Trains a logistic regression classifier."""
    model = LogisticRegression(max_iter=1000, random_state=RANDOM_STATE)
    model.fit(X_train, y_train)
    return model


def train_random_forest(X_train: pd.DataFrame, y_train: pd.Series) -> RandomForestClassifier:
    """Trains a random forest classifier."""
    model = RandomForestClassifier(random_state=RANDOM_STATE)
    model.fit(X_train, y_train)
    return model


def train_gradient_boosting(X_train: pd.DataFrame, y_train: pd.Series) -> GradientBoostingClassifier:
    """Trains a gradient boosting classifier."""
    model = GradientBoostingClassifier(random_state=RANDOM_STATE)
    model.fit(X_train, y_train)
    return model


def evaluate_model(
    model: ClassifierMixin, X_test: pd.DataFrame, y_test: pd.Series
) -> dict[str, float]:
    """Computes accuracy, precision, recall, F1-score, and ROC-AUC on the test set."""
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    return {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred),
        "recall": recall_score(y_test, y_pred),
        "f1_score": f1_score(y_test, y_pred),
        "roc_auc": roc_auc_score(y_test, y_proba),
    }


def save_confusion_matrix_plot(
    model: ClassifierMixin, X_test: pd.DataFrame, y_test: pd.Series, model_slug: str
) -> None:
    """Saves a confusion matrix plot for one model to OUTPUT_DIR."""
    ConfusionMatrixDisplay.from_estimator(model, X_test, y_test)
    plt.title(f"Confusion Matrix - {model_slug.replace('_', ' ').title()}")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / f"{model_slug}_confusion_matrix.png")
    plt.close()


def save_roc_curve_plot(
    model: ClassifierMixin, X_test: pd.DataFrame, y_test: pd.Series, model_slug: str
) -> None:
    """Saves an ROC curve plot (with AUC labeled) for one model to OUTPUT_DIR."""
    RocCurveDisplay.from_estimator(model, X_test, y_test)
    plt.title(f"ROC Curve - {model_slug.replace('_', ' ').title()}")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / f"{model_slug}_roc.png")
    plt.close()


def save_comparison_bar_chart(results: dict[str, dict[str, float]]) -> None:
    """Saves one bar chart comparing accuracy, F1-score, and ROC-AUC across models."""
    metrics_to_plot = ["accuracy", "f1_score", "roc_auc"]
    model_names = list(results.keys())

    x_positions = range(len(model_names))
    bar_width = 0.25
    _, ax = plt.subplots(figsize=(8, 5))

    for offset, metric in enumerate(metrics_to_plot):
        values = [results[model_name][metric] for model_name in model_names]
        positions = [x + offset * bar_width for x in x_positions]
        ax.bar(positions, values, width=bar_width, label=metric)

    ax.set_xticks([x + bar_width for x in x_positions])
    ax.set_xticklabels([name.replace("_", " ").title() for name in model_names])
    ax.set_ylabel("Score")
    ax.set_title("Model Comparison: Accuracy, F1-Score, ROC-AUC")
    ax.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "comparison_metrics.png")
    plt.close()


def print_comparison_table(results: dict[str, dict[str, float]]) -> None:
    """Prints a console table comparing all models across all metrics."""
    header = f"{'Model':<22}{'Accuracy':<11}{'Precision':<12}{'Recall':<10}{'F1':<10}{'ROC-AUC':<10}"
    print(header)
    print("-" * len(header))
    for model_name, metrics in results.items():
        print(
            f"{model_name:<22}"
            f"{metrics['accuracy']:<11.4f}"
            f"{metrics['precision']:<12.4f}"
            f"{metrics['recall']:<10.4f}"
            f"{metrics['f1_score']:<10.4f}"
            f"{metrics['roc_auc']:<10.4f}"
        )


def select_best_model(results: dict[str, dict[str, float]]) -> str:
    """Selects the best model by highest F1-score, tie-broken by highest ROC-AUC."""
    return max(results, key=lambda name: (results[name]["f1_score"], results[name]["roc_auc"]))


def save_best_model(
    model: ClassifierMixin, feature_columns: list[str]
) -> None:
    """Saves the winning model and its feature contract to OUTPUT_DIR."""
    joblib.dump(model, OUTPUT_DIR / "best_model.pkl")

    feature_contract = {
        "feature_columns": feature_columns,
        "numeric_features": NUMERIC_FEATURE_COLUMNS,
        "categorical_features": CATEGORICAL_FEATURE_COLUMNS,
        "encoding": "one_hot_drop_first_false",
        "target_column": TARGET_COLUMN,
    }
    with open(OUTPUT_DIR / "feature_columns.json", "w", encoding="utf-8") as f:
        json.dump(feature_contract, f, indent=2)


def run_pipeline() -> None:
    """Runs the full train/evaluate/compare/select/save pipeline end to end."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    X, y = load_and_encode_data()
    X_train, X_test, y_train, y_test = split_data(X, y)

    trainers = {
        "logistic_regression": train_logistic_regression,
        "random_forest": train_random_forest,
        "gradient_boosting": train_gradient_boosting,
    }

    models: dict[str, ClassifierMixin] = {}
    results: dict[str, dict[str, float]] = {}

    for model_name, trainer in trainers.items():
        model = trainer(X_train, y_train)
        models[model_name] = model
        results[model_name] = evaluate_model(model, X_test, y_test)
        save_confusion_matrix_plot(model, X_test, y_test, model_name)
        save_roc_curve_plot(model, X_test, y_test, model_name)

    save_comparison_bar_chart(results)
    print_comparison_table(results)

    best_model_name = select_best_model(results)
    best_metrics = results[best_model_name]
    print(
        f"\nBest model: {best_model_name} "
        f"(F1={best_metrics['f1_score']:.4f}, ROC-AUC={best_metrics['roc_auc']:.4f}) "
        "- selected for highest F1-score, tie-broken by ROC-AUC."
    )

    save_best_model(models[best_model_name], list(X.columns))


if __name__ == "__main__":
    run_pipeline()
