"""
Anomaly detection and alert generation for the SMM Analytics Platform.

Uses both statistical Z-score analysis and machine-learning Isolation Forest
to surface unusual posts and generate actionable Alert records.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

try:
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        f = float(val)
        return default if (np.isnan(f) or np.isinf(f)) else f
    except Exception:
        return default


def _round(val: Any, decimals: int = 4) -> float:
    try:
        return round(float(val), decimals)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Severity logic
# ---------------------------------------------------------------------------

def _er_severity(z_score: float) -> str:
    """Classify ER anomaly severity by Z-score magnitude."""
    abs_z = abs(z_score)
    if abs_z >= 3.5:
        return "critical"
    if abs_z >= 3.0:
        return "warning"
    if z_score > 2.0:   # positive = over-performing
        return "good"
    return "warning"    # negative (under-performing)


# ---------------------------------------------------------------------------
# Z-score anomaly detection
# ---------------------------------------------------------------------------

def _zscore_anomalies(df: pd.DataFrame) -> list[dict]:
    alerts = []
    if "engagement_rate" not in df.columns or len(df) < 5:
        return alerts

    er = df["engagement_rate"].fillna(0).astype(float)
    if er.std() == 0:
        return alerts

    zscores = stats.zscore(er)
    avg_er = float(er.mean())

    for idx, z in enumerate(zscores):
        if abs(z) <= 2.0:
            continue
        row = df.iloc[idx]
        post_er = _safe_float(row.get("engagement_rate", 0))
        post_id = str(row.get("post_id", "")) or None

        direction = "outperformed" if z > 0 else "underperformed"
        severity = _er_severity(z)

        posted_at = row.get("date", "")
        if hasattr(posted_at, "strftime"):
            posted_at = posted_at.strftime("%Y-%m-%d")
        else:
            posted_at = str(posted_at)[:10] if posted_at else "unknown date"

        alerts.append({
            "alert_type": "anomaly",
            "severity": severity,
            "title": f"Post {direction} significantly on {posted_at}",
            "description": (
                f"This post achieved an engagement rate of {post_er:.2f}% "
                f"(Z-score: {z:.2f}), compared to the average of {avg_er:.2f}%. "
                f"That is {abs(z):.1f} standard deviations from the mean."
            ),
            "metric": "engagement_rate",
            "value": _round(post_er),
            "baseline": _round(avg_er),
            "post_id": post_id,
        })

    return alerts


# ---------------------------------------------------------------------------
# Isolation Forest anomaly detection
# ---------------------------------------------------------------------------

def _isolation_forest_anomalies(df: pd.DataFrame, contamination: float = 0.05) -> list[dict]:
    if not SKLEARN_AVAILABLE:
        return []

    feature_cols = ["likes", "comments", "shares", "saves", "reach"]
    available = [c for c in feature_cols if c in df.columns]
    if not available or len(df) < 10:
        return []

    X = df[available].fillna(0).astype(float).values

    # Check for zero-variance features
    variances = X.var(axis=0)
    non_zero_cols = [available[i] for i, v in enumerate(variances) if v > 0]
    if not non_zero_cols:
        return []

    X_filtered = df[non_zero_cols].fillna(0).astype(float).values

    try:
        clf = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100,
        )
        preds = clf.fit_predict(X_filtered)   # -1 = anomaly, 1 = normal
        scores = clf.decision_function(X_filtered)  # lower = more anomalous
    except Exception:
        return []

    alerts = []
    avg_reach = _safe_float(df["reach"].mean()) if "reach" in df.columns else 0.0

    for idx, (pred, score) in enumerate(zip(preds, scores)):
        if pred != -1:
            continue
        row = df.iloc[idx]
        post_id = str(row.get("post_id", "")) or None
        post_reach = _safe_float(row.get("reach", 0))

        posted_at = row.get("date", "")
        if hasattr(posted_at, "strftime"):
            posted_at = posted_at.strftime("%Y-%m-%d")
        else:
            posted_at = str(posted_at)[:10] if posted_at else "unknown date"

        # Determine if it was a positive or negative outlier by reach
        if post_reach > avg_reach * 1.5:
            severity = "good"
            description = (
                f"Isolation Forest flagged this post on {posted_at} as an "
                f"outlier with unusually HIGH engagement metrics "
                f"(anomaly score: {score:.3f})."
            )
        else:
            severity = "warning"
            description = (
                f"Isolation Forest flagged this post on {posted_at} as an "
                f"outlier with unusually LOW multi-metric engagement "
                f"(anomaly score: {score:.3f})."
            )

        alerts.append({
            "alert_type": "anomaly",
            "severity": severity,
            "title": f"Multi-metric anomaly detected on {posted_at}",
            "description": description,
            "metric": "multi_metric",
            "value": _round(score, 4),
            "baseline": 0.0,
            "post_id": post_id,
        })

    return alerts


# ---------------------------------------------------------------------------
# Follower drop / ER drop detection
# ---------------------------------------------------------------------------

def _follower_drop_alerts(df: pd.DataFrame) -> list[dict]:
    alerts = []
    if "followers" not in df.columns or len(df) < 3:
        return alerts

    followers = df["followers"].ffill().fillna(0).astype(float)
    if followers.std() == 0:
        return alerts

    # Detect drops > 5% from rolling max
    rolling_max = followers.cummax()
    drop_pct = (rolling_max - followers) / rolling_max.replace(0, np.nan) * 100
    drop_pct = drop_pct.fillna(0)

    significant_drops = drop_pct[drop_pct > 5]
    if significant_drops.empty:
        return alerts

    max_drop_idx = significant_drops.idxmax()
    max_drop = drop_pct[max_drop_idx]
    row = df.loc[max_drop_idx]

    posted_at = row.get("date", "")
    if hasattr(posted_at, "strftime"):
        posted_at = posted_at.strftime("%Y-%m-%d")
    else:
        posted_at = str(posted_at)[:10] if posted_at else "unknown date"

    alerts.append({
        "alert_type": "threshold",
        "severity": "critical" if max_drop > 15 else "warning",
        "title": f"Follower count drop of {max_drop:.1f}% detected",
        "description": (
            f"The follower count dropped by {max_drop:.1f}% from its peak "
            f"around {posted_at}. Investigate recent content or posting activity."
        ),
        "metric": "followers",
        "value": _round(float(followers[max_drop_idx])),
        "baseline": _round(float(rolling_max[max_drop_idx])),
        "post_id": None,
    })
    return alerts


def _er_drop_alerts(df: pd.DataFrame) -> list[dict]:
    """Detect if recent 20% of posts have significantly lower ER than earlier 80%."""
    alerts = []
    if len(df) < 10 or "engagement_rate" not in df.columns:
        return alerts

    er = df["engagement_rate"].fillna(0).astype(float)
    split = int(len(er) * 0.8)
    earlier = er.iloc[:split]
    recent = er.iloc[split:]

    if earlier.mean() == 0:
        return alerts

    drop = (earlier.mean() - recent.mean()) / earlier.mean() * 100
    if drop > 10:
        severity = "critical" if drop > 30 else "warning"
        alerts.append({
            "alert_type": "trend",
            "severity": severity,
            "title": f"Engagement rate dropped {drop:.1f}% recently",
            "description": (
                f"Recent posts average {recent.mean():.2f}% ER vs "
                f"{earlier.mean():.2f}% for earlier posts — a {drop:.1f}% decline. "
                "Consider reviewing recent content strategy."
            ),
            "metric": "engagement_rate",
            "value": _round(recent.mean()),
            "baseline": _round(earlier.mean()),
            "post_id": None,
        })
    return alerts


# ---------------------------------------------------------------------------
# Milestone detection
# ---------------------------------------------------------------------------

def _milestone_alerts(df: pd.DataFrame, analytics_result: dict = None) -> list[dict]:
    alerts = []

    if analytics_result is None:
        return alerts

    avg_er = _safe_float(analytics_result.get("avg_engagement_rate", 0))
    total_posts = int(analytics_result.get("total_posts", 0))
    follower_count = _safe_float(analytics_result.get("follower_count", 0))

    # Milestone: high average ER
    if avg_er > 5.0:
        alerts.append({
            "alert_type": "milestone",
            "severity": "good",
            "title": f"Excellent average engagement rate of {avg_er:.2f}%",
            "description": (
                f"Your average engagement rate of {avg_er:.2f}% is above the 5% "
                "benchmark — well above the industry average of 1-3%."
            ),
            "metric": "avg_engagement_rate",
            "value": _round(avg_er),
            "baseline": 5.0,
            "post_id": None,
        })
    elif avg_er > 3.0:
        alerts.append({
            "alert_type": "milestone",
            "severity": "info",
            "title": f"Good engagement rate of {avg_er:.2f}%",
            "description": (
                f"Your average engagement rate of {avg_er:.2f}% is above the "
                "industry average of 1-3%."
            ),
            "metric": "avg_engagement_rate",
            "value": _round(avg_er),
            "baseline": 3.0,
            "post_id": None,
        })

    # Milestone: large follower base
    if follower_count >= 100_000:
        alerts.append({
            "alert_type": "milestone",
            "severity": "good",
            "title": f"100K+ followers milestone reached ({int(follower_count):,})",
            "description": "Your audience has grown past the 100,000 follower mark.",
            "metric": "follower_count",
            "value": _round(follower_count, 0),
            "baseline": 100_000.0,
            "post_id": None,
        })
    elif follower_count >= 10_000:
        alerts.append({
            "alert_type": "milestone",
            "severity": "good",
            "title": f"10K+ followers milestone reached ({int(follower_count):,})",
            "description": "Your account has surpassed 10,000 followers.",
            "metric": "follower_count",
            "value": _round(follower_count, 0),
            "baseline": 10_000.0,
            "post_id": None,
        })

    return alerts


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_anomalies(df: pd.DataFrame, contamination: float = 0.05, analytics_result: dict = None) -> list[dict]:
    """
    Combine Z-score and Isolation Forest anomaly detection with threshold
    and milestone alerts.

    Returns a deduplicated list of Alert dicts ready for DB insertion.
    """
    alerts: list[dict] = []

    # Z-score per-post
    alerts.extend(_zscore_anomalies(df))

    # Multi-metric isolation forest
    alerts.extend(_isolation_forest_anomalies(df, contamination))

    # Follower drop
    alerts.extend(_follower_drop_alerts(df))

    # ER drop
    alerts.extend(_er_drop_alerts(df))

    # Milestones
    alerts.extend(_milestone_alerts(df, analytics_result))

    # Deduplicate by (title, metric) to avoid exact duplicates
    seen: set[tuple] = set()
    unique: list[dict] = []
    for alert in alerts:
        key = (alert.get("title", ""), alert.get("metric", ""), str(alert.get("post_id", "")))
        if key not in seen:
            seen.add(key)
            unique.append(alert)

    # Sort: critical first, then warning, good, info
    severity_order = {"critical": 0, "warning": 1, "good": 2, "info": 3}
    unique.sort(key=lambda a: severity_order.get(a.get("severity", "info"), 4))

    return unique


def generate_trend_alerts(analytics_result: dict) -> list[dict]:
    """
    Generate trend-level alerts from the aggregated analytics result.
    These are broader pattern alerts not tied to individual posts.
    """
    alerts: list[dict] = []

    engagement_trend = analytics_result.get("engagement_trend", "flat")
    reach_growth_rate = _safe_float(analytics_result.get("reach_growth_rate", 0))
    posting_freq = _safe_float(analytics_result.get("posting_frequency", 0))
    avg_er = _safe_float(analytics_result.get("avg_engagement_rate", 0))

    # ER trend direction
    if engagement_trend == "down":
        alerts.append({
            "alert_type": "trend",
            "severity": "critical",
            "title": "Engagement rate is trending downward",
            "description": (
                "Statistical linear regression on your engagement rate time series "
                "shows a significant downward slope. Action is recommended to reverse "
                "this trend before it accelerates."
            ),
            "metric": "engagement_rate",
            "value": avg_er,
            "baseline": 0.0,
            "post_id": None,
        })
    elif engagement_trend == "up":
        alerts.append({
            "alert_type": "trend",
            "severity": "good",
            "title": "Engagement rate is trending upward",
            "description": (
                "Your engagement rate is showing a positive upward trend. "
                "Keep up the current content strategy."
            ),
            "metric": "engagement_rate",
            "value": avg_er,
            "baseline": 0.0,
            "post_id": None,
        })

    # Reach growth
    if reach_growth_rate > 20:
        alerts.append({
            "alert_type": "milestone",
            "severity": "good",
            "title": f"Reach grew by {reach_growth_rate:.1f}% over the period",
            "description": (
                f"Your total reach increased by {reach_growth_rate:.1f}% "
                "from the first week to the last. Strong organic growth signal."
            ),
            "metric": "reach_growth_rate",
            "value": reach_growth_rate,
            "baseline": 0.0,
            "post_id": None,
        })
    elif reach_growth_rate < -20:
        alerts.append({
            "alert_type": "trend",
            "severity": "warning",
            "title": f"Reach declined by {abs(reach_growth_rate):.1f}% over the period",
            "description": (
                f"Your total weekly reach dropped by {abs(reach_growth_rate):.1f}% "
                "comparing the first and last weeks. Consider boosting distribution."
            ),
            "metric": "reach_growth_rate",
            "value": reach_growth_rate,
            "baseline": 0.0,
            "post_id": None,
        })

    # Posting frequency
    if posting_freq < 1:
        alerts.append({
            "alert_type": "threshold",
            "severity": "warning",
            "title": f"Low posting frequency: {posting_freq:.1f} posts/week",
            "description": (
                "Posting less than once a week may limit algorithmic reach. "
                "Aim for a minimum of 3-5 posts per week for optimal visibility."
            ),
            "metric": "posting_frequency",
            "value": posting_freq,
            "baseline": 3.0,
            "post_id": None,
        })

    return alerts
