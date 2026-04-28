"""
Comparison route — side-by-side analytics for two uploads.
GET /api/compare/<upload_id_a>/<upload_id_b>
"""

from __future__ import annotations

import json
from collections import defaultdict

from flask import Blueprint, jsonify

from .. import db
from ..utils.auth import require_auth
from ..models import Analytics, Upload

compare_bp = Blueprint("compare", __name__)


def _load(val, default):
    if val is None:
        return default
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


def _delta(a: float, b: float) -> dict:
    """Return absolute and percentage delta (b relative to a)."""
    delta = round(b - a, 4)
    if a == 0:
        pct = 0.0
    else:
        pct = round((b - a) / abs(a) * 100, 2)
    trend = "up" if delta > 0 else ("down" if delta < 0 else "flat")
    return {"delta": delta, "delta_pct": pct, "trend": trend}


def _group_daily_to_monthly(daily: list) -> list:
    """Aggregate daily trend into monthly buckets."""
    monthly: dict[str, dict] = defaultdict(lambda: {"posts": 0, "er_sum": 0.0, "reach": 0.0, "count": 0})
    for d in daily:
        month = str(d.get("date", ""))[:7]  # "YYYY-MM"
        if not month:
            continue
        monthly[month]["posts"] += d.get("posts", 0)
        monthly[month]["er_sum"] += d.get("avg_er", 0) * d.get("posts", 1)
        monthly[month]["reach"] += d.get("reach", 0)
        monthly[month]["count"] += d.get("posts", 1)
    result = []
    for month in sorted(monthly.keys()):
        m = monthly[month]
        result.append({
            "month": month,
            "posts": m["posts"],
            "avg_er": round(m["er_sum"] / max(m["count"], 1), 4),
            "total_reach": round(m["reach"], 0),
        })
    return result


@compare_bp.route("/api/compare/<upload_id_a>/<upload_id_b>", methods=["GET"])
@require_auth
def compare_uploads(upload_id_a: str, upload_id_b: str):
    upload_a = Upload.query.get(upload_id_a)
    upload_b = Upload.query.get(upload_id_b)

    if not upload_a or not upload_b:
        return jsonify({"error": "One or both uploads not found"}), 404

    analytics_a = Analytics.query.filter_by(upload_id=upload_id_a).first()
    analytics_b = Analytics.query.filter_by(upload_id=upload_id_b).first()

    if not analytics_a or not analytics_b:
        return jsonify({"error": "Analytics not ready for one or both uploads"}), 404

    # ── KPI comparison ────────────────────────────────────────────────────────
    metrics = []
    kpi_map = [
        ("avg_engagement_rate",  "Avg Engagement Rate", "%"),
        ("median_engagement_rate","Median ER",           "%"),
        ("er_p90",               "ER p90",              "%"),
        ("total_reach",          "Total Reach",         ""),
        ("total_likes",          "Total Likes",         ""),
        ("total_comments",       "Total Comments",      ""),
        ("total_shares",         "Total Shares",        ""),
        ("total_saves",          "Total Saves",         ""),
        ("follower_count",       "Followers",           ""),
        ("follower_growth",      "Follower Growth",     ""),
        ("virality_rate",        "Virality Rate",       "%"),
        ("save_rate",            "Save Rate",           "%"),
        ("posting_frequency",    "Posts / Week",        ""),
        ("total_posts",          "Total Posts",         ""),
        ("reach_growth_rate",    "Reach Growth Rate",   "%"),
    ]
    for key, label, unit in kpi_map:
        val_a = float(getattr(analytics_a, key, 0) or 0)
        val_b = float(getattr(analytics_b, key, 0) or 0)
        d = _delta(val_a, val_b)
        metrics.append({
            "key": key,
            "label": label,
            "unit": unit,
            "a": round(val_a, 4),
            "b": round(val_b, 4),
            **d,
        })

    # ── Time series ───────────────────────────────────────────────────────────
    daily_a  = _load(analytics_a.daily_trend,  [])
    daily_b  = _load(analytics_b.daily_trend,  [])
    weekly_a = _load(analytics_a.weekly_trend, [])
    weekly_b = _load(analytics_b.weekly_trend, [])
    monthly_a = _group_daily_to_monthly(daily_a)
    monthly_b = _group_daily_to_monthly(daily_b)

    # ── Post type breakdown ───────────────────────────────────────────────────
    ptb_a = _load(analytics_a.post_type_breakdown, {})
    ptb_b = _load(analytics_b.post_type_breakdown, {})

    # ── Upload summaries ──────────────────────────────────────────────────────
    def _summary(upload, analytics):
        return {
            "id": upload.id,
            "filename": upload.filename,
            "platform": analytics.platform,
            "total_posts": analytics.total_posts,
            "avg_engagement_rate": analytics.avg_engagement_rate,
            "date_range_start": analytics.date_range_start.isoformat() if analytics.date_range_start else None,
            "date_range_end": analytics.date_range_end.isoformat() if analytics.date_range_end else None,
            "engagement_trend": analytics.engagement_trend,
        }

    return jsonify({
        "upload_a": _summary(upload_a, analytics_a),
        "upload_b": _summary(upload_b, analytics_b),
        "metrics": metrics,
        "daily_a":   daily_a,
        "daily_b":   daily_b,
        "weekly_a":  weekly_a,
        "weekly_b":  weekly_b,
        "monthly_a": monthly_a,
        "monthly_b": monthly_b,
        "post_type_a": ptb_a,
        "post_type_b": ptb_b,
    }), 200
