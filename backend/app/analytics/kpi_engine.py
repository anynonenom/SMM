"""
Core KPI computation engine for the SMM Analytics Platform.

Works on any normalised DataFrame produced by csv_parser.py.
Returns a comprehensive analytics dictionary consumed by all downstream
services (forecasting, anomaly detection, API routes, AI insights).
"""

import re
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        f = float(val)
        return 0.0 if (np.isnan(f) or np.isinf(f)) else f
    except Exception:
        return default


def _safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator == 0 or np.isnan(denominator):
        return default
    result = numerator / denominator
    return _safe_float(result, default)


def _round(val: Any, decimals: int = 4) -> float:
    try:
        return round(float(val), decimals)
    except Exception:
        return 0.0


def _extract_hashtags_from_list(cell) -> list:
    """Return a clean list of lowercase hashtag strings from a cell value."""
    if isinstance(cell, list):
        return [str(t).lower().lstrip("#") for t in cell if t]
    if isinstance(cell, str):
        tags = re.findall(r"#?(\w+)", cell)
        return [t.lower() for t in tags if t]
    return []


# ---------------------------------------------------------------------------
# Z-score / anomaly tagging
# ---------------------------------------------------------------------------

def _add_zscore(df: pd.DataFrame) -> pd.DataFrame:
    er = df["engagement_rate"].fillna(0).astype(float)
    if er.std() == 0 or len(er) < 3:
        df["z_score"] = 0.0
        df["is_anomaly"] = False
        return df
    df["z_score"] = stats.zscore(er)
    df["is_anomaly"] = df["z_score"].abs() > 2.0
    return df


# ---------------------------------------------------------------------------
# Caption length
# ---------------------------------------------------------------------------

def _caption_length_correlation(df: pd.DataFrame) -> float:
    if "caption" not in df.columns:
        return 0.0
    lengths = df["caption"].fillna("").astype(str).apply(len)
    er = df["engagement_rate"].fillna(0).astype(float)
    if lengths.std() == 0 or er.std() == 0 or len(lengths) < 5:
        return 0.0
    corr, _ = stats.pearsonr(lengths, er)
    return _round(corr)


# ---------------------------------------------------------------------------
# Posting heatmap (day × hour)
# ---------------------------------------------------------------------------

def _posting_heatmap(df: pd.DataFrame) -> list:
    if "date" not in df.columns or df["date"].isna().all():
        return []
    tmp = df.copy()
    # Convert to Sunday-based (0=Sun … 6=Sat) to match the JS/frontend convention
    tmp["_day"] = (pd.to_datetime(tmp["date"], errors="coerce").dt.dayofweek + 1) % 7
    tmp["_hour"] = pd.to_datetime(tmp["date"], errors="coerce").dt.hour
    tmp = tmp.dropna(subset=["_day", "_hour"])
    if tmp.empty:
        return []
    grouped = (
        tmp.groupby(["_day", "_hour"])
        .agg(avg_er=("engagement_rate", "mean"), count=("engagement_rate", "count"))
        .reset_index()
    )
    return [
        {
            "day": int(row["_day"]),
            "hour": int(row["_hour"]),
            "avg_er": _round(row["avg_er"], 3),
            "count": int(row["count"]),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Best posting day / hour
# ---------------------------------------------------------------------------

def _best_day_hour(df: pd.DataFrame):
    """Return (best_day: int, best_hour: int) based on highest avg ER.
    Day is Sunday-based (0=Sun … 6=Sat) matching the frontend convention.
    """
    if "date" not in df.columns or df["date"].isna().all():
        return 0, 12
    tmp = df.copy()
    tmp["_day"]  = (pd.to_datetime(tmp["date"], errors="coerce").dt.dayofweek + 1) % 7
    tmp["_hour"] = pd.to_datetime(tmp["date"], errors="coerce").dt.hour

    day_er  = tmp.groupby("_day")["engagement_rate"].mean()
    hour_er = tmp.groupby("_hour")["engagement_rate"].mean()

    best_day  = int(day_er.idxmax())  if not day_er.empty  else 0
    best_hour = int(hour_er.idxmax()) if not hour_er.empty else 12
    return best_day, best_hour


# ---------------------------------------------------------------------------
# Weekly trend
# ---------------------------------------------------------------------------

def _weekly_trend(df: pd.DataFrame) -> list:
    if "date" not in df.columns or df["date"].isna().all():
        return []
    tmp = df.copy()
    tmp["_date"] = pd.to_datetime(tmp["date"], errors="coerce")
    tmp = tmp.dropna(subset=["_date"])
    if tmp.empty:
        return []
    tmp["_week"] = tmp["_date"].dt.to_period("W").apply(lambda p: p.start_time)
    grouped = (
        tmp.groupby("_week")
        .agg(
            posts=("engagement_rate", "count"),
            avg_er=("engagement_rate", "mean"),
            total_reach=("reach", "sum"),
            total_likes=("likes", "sum"),
        )
        .reset_index()
    )
    return [
        {
            "week": row["_week"].strftime("%Y-%m-%d"),
            "posts": int(row["posts"]),
            "avg_er": _round(row["avg_er"], 3),
            "total_reach": _round(row["total_reach"], 0),
            "total_likes": _round(row["total_likes"], 0),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Daily trend
# ---------------------------------------------------------------------------

def _daily_trend(df: pd.DataFrame) -> list:
    if "date" not in df.columns or df["date"].isna().all():
        return []
    tmp = df.copy()
    tmp["_date"] = pd.to_datetime(tmp["date"], errors="coerce").dt.date
    tmp = tmp.dropna(subset=["_date"])
    if tmp.empty:
        return []
    grouped = (
        tmp.groupby("_date")
        .agg(
            posts=("engagement_rate", "count"),
            avg_er=("engagement_rate", "mean"),
            reach=("reach", "sum"),
        )
        .reset_index()
    )
    return [
        {
            "date": str(row["_date"]),
            "posts": int(row["posts"]),
            "avg_er": _round(row["avg_er"], 3),
            "reach": _round(row["reach"], 0),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Monthly trend
# ---------------------------------------------------------------------------

def _monthly_trend(df: pd.DataFrame) -> list:
    if "date" not in df.columns or df["date"].isna().all():
        return []
    tmp = df.copy()
    tmp["_date"] = pd.to_datetime(tmp["date"], errors="coerce")
    tmp = tmp.dropna(subset=["_date"])
    if tmp.empty:
        return []
    tmp["_month"] = tmp["_date"].dt.to_period("M")
    grouped = (
        tmp.groupby("_month")
        .agg(
            posts=("engagement_rate", "count"),
            avg_er=("engagement_rate", "mean"),
            total_reach=("reach", "sum"),
            total_likes=("likes", "sum"),
            total_comments=("comments", "sum"),
            total_shares=("shares", "sum"),
            total_impressions=("impressions", "sum"),
        )
        .reset_index()
    )
    return [
        {
            "month": str(row["_month"]),  # e.g. "2024-01"
            "posts": int(row["posts"]),
            "avg_er": _round(row["avg_er"], 3),
            "total_reach": _round(row["total_reach"], 0),
            "total_likes": _round(row["total_likes"], 0),
            "total_comments": _round(row["total_comments"], 0),
            "total_shares": _round(row["total_shares"], 0),
            "total_impressions": _round(row["total_impressions"], 0),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Yearly trend
# ---------------------------------------------------------------------------

def _yearly_trend(df: pd.DataFrame) -> list:
    if "date" not in df.columns or df["date"].isna().all():
        return []
    tmp = df.copy()
    tmp["_date"] = pd.to_datetime(tmp["date"], errors="coerce")
    tmp = tmp.dropna(subset=["_date"])
    if tmp.empty:
        return []
    tmp["_year"] = tmp["_date"].dt.year
    grouped = (
        tmp.groupby("_year")
        .agg(
            posts=("engagement_rate", "count"),
            avg_er=("engagement_rate", "mean"),
            total_reach=("reach", "sum"),
            total_likes=("likes", "sum"),
            total_comments=("comments", "sum"),
            total_shares=("shares", "sum"),
            total_impressions=("impressions", "sum"),
        )
        .reset_index()
    )
    return [
        {
            "year": int(row["_year"]),
            "posts": int(row["posts"]),
            "avg_er": _round(row["avg_er"], 3),
            "total_reach": _round(row["total_reach"], 0),
            "total_likes": _round(row["total_likes"], 0),
            "total_comments": _round(row["total_comments"], 0),
            "total_shares": _round(row["total_shares"], 0),
            "total_impressions": _round(row["total_impressions"], 0),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Post type breakdown
# ---------------------------------------------------------------------------

def _post_type_breakdown(df: pd.DataFrame) -> dict:
    if "post_type" not in df.columns:
        return {}
    total = len(df)
    grouped = (
        df.groupby("post_type")
        .agg(
            count=("engagement_rate", "count"),
            avg_er=("engagement_rate", "mean"),
            avg_reach=("reach", "mean"),
            total_likes=("likes", "sum"),
        )
        .reset_index()
    )
    result = {}
    for _, row in grouped.iterrows():
        pt = str(row["post_type"]) if row["post_type"] else "unknown"
        result[pt] = {
            "count": int(row["count"]),
            "avg_er": _round(row["avg_er"], 3),
            "avg_reach": _round(row["avg_reach"], 0),
            "total_likes": _round(row["total_likes"], 0),
            "pct": _round(row["count"] / total * 100, 1) if total > 0 else 0,
        }
    return result


# ---------------------------------------------------------------------------
# Top hashtags
# ---------------------------------------------------------------------------

def _top_hashtags(df: pd.DataFrame, top_n: int = 20) -> list:
    """
    Extract hashtags from the 'hashtags' column (already parsed as lists)
    and from captions. Return top_n by frequency with avg ER per hashtag.
    """
    tag_records: list[dict] = []  # [{tag, er}]

    for _, row in df.iterrows():
        tags = _extract_hashtags_from_list(row.get("hashtags", []))
        er = _safe_float(row.get("engagement_rate", 0))
        for tag in tags:
            tag_records.append({"tag": tag, "er": er})

    if not tag_records:
        return []

    tag_df = pd.DataFrame(tag_records)
    grouped = (
        tag_df.groupby("tag")
        .agg(count=("er", "count"), avg_er=("er", "mean"))
        .reset_index()
        .sort_values("count", ascending=False)
        .head(top_n)
    )
    return [
        {
            "tag": f"#{row['tag']}",
            "count": int(row["count"]),
            "avg_er": _round(row["avg_er"], 3),
        }
        for _, row in grouped.iterrows()
    ]


# ---------------------------------------------------------------------------
# Engagement trend via linear regression on ER over time
# ---------------------------------------------------------------------------

def _engagement_trend(df: pd.DataFrame) -> str:
    """Classify ER trend via linear regression.
    Threshold is 1% of mean ER per post (relative), so it scales correctly
    whether the account averages 1% or 20% ER.
    """
    er = df["engagement_rate"].fillna(0).astype(float).values
    if len(er) < 5:
        return "flat"
    mean_er = float(np.mean(er)) if np.mean(er) > 0 else 1.0
    threshold = mean_er * 0.01          # 1 % of mean ER per step
    x = np.arange(len(er)).reshape(-1, 1)
    slope, _, _, _, _ = stats.linregress(x.ravel(), er)
    if slope > threshold:
        return "up"
    if slope < -threshold:
        return "down"
    return "flat"


# ---------------------------------------------------------------------------
# Reach growth rate (first week vs last week)
# ---------------------------------------------------------------------------

def _reach_growth_rate(weekly_trend: list) -> float:
    """Compare average reach of first half vs second half of the period.
    More robust than first-week vs last-week which is sensitive to outliers.
    """
    if len(weekly_trend) < 2:
        return 0.0
    mid  = len(weekly_trend) // 2
    prev = [w["total_reach"] for w in weekly_trend[:mid]]
    curr = [w["total_reach"] for w in weekly_trend[mid:]]
    prev_avg = sum(prev) / len(prev) if prev else 0.0
    curr_avg = sum(curr) / len(curr) if curr else 0.0
    return _round(_safe_divide(curr_avg - prev_avg, max(prev_avg, 1)) * 100)


# ---------------------------------------------------------------------------
# Posting frequency (posts per week)
# ---------------------------------------------------------------------------

def _posting_frequency(df: pd.DataFrame) -> float:
    if "date" not in df.columns or df["date"].isna().all():
        return 0.0
    dates = pd.to_datetime(df["date"], errors="coerce").dropna()
    if dates.empty or len(dates) < 2:
        return _safe_float(len(df))
    span_days = (dates.max() - dates.min()).days
    if span_days == 0:
        return _safe_float(len(df))
    weeks = span_days / 7
    return _round(len(df) / weeks, 2)


# ---------------------------------------------------------------------------
# Posts serialisation
# ---------------------------------------------------------------------------

def _posts_to_dicts(df: pd.DataFrame) -> list:
    records = []
    for _, row in df.iterrows():
        hashtags = row.get("hashtags", [])
        if not isinstance(hashtags, list):
            hashtags = _extract_hashtags_from_list(hashtags)

        posted_at = row.get("date")
        if pd.isna(posted_at) if not isinstance(posted_at, list) else False:
            posted_at = None
        elif hasattr(posted_at, "isoformat"):
            posted_at = posted_at.isoformat()
        else:
            posted_at = str(posted_at) if posted_at else None

        records.append({
            "post_id": str(row.get("post_id", "")),
            "posted_at": posted_at,
            "post_type": str(row.get("post_type", "")),
            "caption": str(row.get("caption", "")),
            "likes": _safe_float(row.get("likes", 0)),
            "comments": _safe_float(row.get("comments", 0)),
            "shares": _safe_float(row.get("shares", 0)),
            "saves": _safe_float(row.get("saves", 0)),
            "reach": _safe_float(row.get("reach", 0)),
            "impressions": _safe_float(row.get("impressions", 0)),
            "engagement_rate": _round(row.get("engagement_rate", 0), 4),
            "virality_rate": _round(
                _safe_divide(_safe_float(row.get("shares", 0)), max(_safe_float(row.get("reach", 0)), 1)) * 100, 4
            ),
            "save_rate": _round(
                _safe_divide(_safe_float(row.get("saves", 0)), max(_safe_float(row.get("impressions", 0)), 1)) * 100, 4
            ),
            "z_score": _round(row.get("z_score", 0), 4),
            "is_anomaly": bool(row.get("is_anomaly", False)),
            "story_exits": _safe_float(row.get("story_exits")) if row.get("story_exits") else None,
            "story_replies": _safe_float(row.get("story_replies")) if row.get("story_replies") else None,
            "video_views": _safe_float(row.get("video_views")) if row.get("video_views") else None,
            "video_completion_rate": _safe_float(row.get("video_completion_rate")) if row.get("video_completion_rate") else None,
            "hashtags": hashtags,
        })
    return records


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compute_full_analytics(df: pd.DataFrame, platform: str) -> dict:
    """
    Compute a comprehensive analytics dictionary from a normalised DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        Normalised DataFrame from csv_parser.parse_csv()
    platform : str
        Detected platform string (e.g. 'instagram', 'tiktok', 'generic')

    Returns
    -------
    dict
        Full analytics result consumed by routes, forecasting, anomaly, and AI.
    """
    # ------------------------------------------------------------------
    # Guard: ensure required numeric columns exist and are float
    # ------------------------------------------------------------------
    numeric_cols = [
        "likes", "comments", "shares", "saves",
        "reach", "impressions", "followers", "engagement_rate",
        "video_views", "video_completion_rate",
        "story_exits", "story_replies",
    ]
    for col in numeric_cols:
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(float)

    # ------------------------------------------------------------------
    # Z-scores
    # ------------------------------------------------------------------
    df = _add_zscore(df)

    # ------------------------------------------------------------------
    # Core aggregates
    # ------------------------------------------------------------------
    total_posts = len(df)
    er_series = df["engagement_rate"].astype(float)

    # Use only posts that actually had reach/impressions for ER stats —
    # posts with zero reach have 0 ER by default and would unfairly drag averages down.
    active_mask = (df["reach"].astype(float) > 0) | (df["impressions"].astype(float) > 0)
    er_active   = er_series[active_mask] if active_mask.any() else er_series

    avg_er    = _round(er_active.mean())   if len(er_active) > 0  else 0.0
    median_er = _round(er_active.median()) if len(er_active) > 0  else 0.0
    er_std    = _round(er_active.std())    if len(er_active) > 1  else 0.0
    er_p75    = _round(float(np.percentile(er_active, 75))) if len(er_active) > 0 else 0.0
    er_p90    = _round(float(np.percentile(er_active, 90))) if len(er_active) > 0 else 0.0

    total_reach = _round(df["reach"].sum(), 0)
    total_impressions = _round(df["impressions"].sum(), 0)
    total_likes = _round(df["likes"].sum(), 0)
    total_comments = _round(df["comments"].sum(), 0)
    total_shares = _round(df["shares"].sum(), 0)
    total_saves = _round(df["saves"].sum(), 0)

    avg_reach_per_post = _round(_safe_divide(total_reach, total_posts))
    avg_impressions_per_post = _round(_safe_divide(total_impressions, total_posts))

    # Derived rates (aggregate level)
    virality_rate = _round(_safe_divide(total_shares, max(total_reach, 1)) * 100, 4)
    save_rate = _round(_safe_divide(total_saves, max(total_impressions, 1)) * 100, 4)
    comment_rate = _round(_safe_divide(total_comments, max(total_reach, 1)) * 100, 4)

    # ------------------------------------------------------------------
    # Followers
    # ------------------------------------------------------------------
    follower_series = df["followers"].astype(float)
    # Current count = highest observed value (most recent snapshot in Meta exports)
    follower_count  = _round(follower_series.max()) if total_posts > 0 else 0.0
    # Growth = max minus min; works even when the column value stays constant
    follower_growth = _round(follower_series.max() - follower_series.min()) if total_posts > 1 else 0.0

    # ------------------------------------------------------------------
    # Date range
    # ------------------------------------------------------------------
    date_series = pd.to_datetime(df["date"], errors="coerce").dropna()
    date_range_start = date_series.min().isoformat() if not date_series.empty else None
    date_range_end = date_series.max().isoformat() if not date_series.empty else None

    # ------------------------------------------------------------------
    # Time-based analytics
    # ------------------------------------------------------------------
    posting_freq = _posting_frequency(df)
    best_day, best_hour = _best_day_hour(df)
    heatmap = _posting_heatmap(df)

    # ------------------------------------------------------------------
    # Trend analytics
    # ------------------------------------------------------------------
    weekly_trend = _weekly_trend(df)
    monthly_trend = _monthly_trend(df)
    yearly_trend = _yearly_trend(df)
    daily_trend = _daily_trend(df)
    engagement_trend = _engagement_trend(df)
    reach_growth_rate = _reach_growth_rate(weekly_trend)

    # ------------------------------------------------------------------
    # Content analysis
    # ------------------------------------------------------------------
    ptb = _post_type_breakdown(df)
    top_post_type = ""
    if ptb:
        top_post_type = max(ptb, key=lambda t: ptb[t].get("avg_er", 0))

    caption_length_impact = _caption_length_correlation(df)
    top_hashtags = _top_hashtags(df)

    # ------------------------------------------------------------------
    # Per-post data
    # ------------------------------------------------------------------
    all_posts = _posts_to_dicts(df)
    sorted_by_er = sorted(all_posts, key=lambda p: p["engagement_rate"], reverse=True)
    top_posts = sorted_by_er[:10]
    worst_posts = sorted_by_er[-5:] if len(sorted_by_er) >= 5 else sorted_by_er[::-1][:5]
    anomaly_posts = [p for p in all_posts if p.get("is_anomaly")]

    # ------------------------------------------------------------------
    # Assemble result
    # ------------------------------------------------------------------
    return {
        # Metadata
        "platform": platform,
        "date_range_start": date_range_start,
        "date_range_end": date_range_end,

        # Volume
        "total_posts": total_posts,

        # Engagement
        "avg_engagement_rate": avg_er,
        "median_engagement_rate": median_er,
        "er_std": er_std,
        "er_p75": er_p75,
        "er_p90": er_p90,
        "engagement_trend": engagement_trend,

        # Reach & Impressions
        "total_reach": total_reach,
        "total_impressions": total_impressions,
        "avg_reach_per_post": avg_reach_per_post,
        "avg_impressions_per_post": avg_impressions_per_post,
        "reach_growth_rate": reach_growth_rate,

        # Interactions
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_shares": total_shares,
        "total_saves": total_saves,

        # Derived rates
        "virality_rate": virality_rate,
        "save_rate": save_rate,
        "comment_rate": comment_rate,

        # Followers
        "follower_count": follower_count,
        "follower_growth": follower_growth,

        # Posting patterns
        "posting_frequency": posting_freq,
        "best_posting_day": best_day,
        "best_posting_hour": best_hour,
        "top_post_type": top_post_type,
        "posting_heatmap": heatmap,

        # Caption analysis
        "caption_length_impact": caption_length_impact,

        # Time series
        "weekly_trend": weekly_trend,
        "monthly_trend": monthly_trend,
        "yearly_trend": yearly_trend,
        "daily_trend": daily_trend,

        # Breakdowns
        "post_type_breakdown": ptb,
        "top_hashtags": top_hashtags,

        # Per-post
        "top_posts": top_posts,
        "worst_posts": worst_posts,
        "anomaly_posts": anomaly_posts,
        "posts": all_posts,

        # Placeholders – filled by downstream modules
        "forecast_data": {},
        "anomalies": [],
        "audience_data": {},
    }
