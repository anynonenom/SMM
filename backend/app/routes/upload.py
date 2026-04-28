"""
Upload route – accepts a CSV, runs the full analytics pipeline, and persists
all results to the database.
"""

from __future__ import annotations

import json
import os
import traceback
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request

from .. import db
from ..models import Alert, Analytics, Post, Upload
from ..utils.auth import require_auth
from ..analytics.csv_parser import parse_csv, split_by_platform
from ..analytics.kpi_engine import compute_full_analytics
from ..analytics.forecasting import forecast_all
from ..analytics.anomaly import detect_anomalies, generate_trend_alerts
from ..analytics.audience import extract_audience_data

upload_bp = Blueprint("upload", __name__)

ALLOWED_EXTENSIONS = {"csv", "tsv", "txt"}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _safe_datetime(val) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        from dateutil import parser as du_parser
        return du_parser.parse(str(val))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# POST /api/upload
# ---------------------------------------------------------------------------

@upload_bp.route("/api/upload", methods=["POST"])
@require_auth
def upload_file():
    """
    Accept a multipart/form-data CSV upload, run the full analytics pipeline,
    persist all records to the database, and return a comprehensive JSON result.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files["file"]
    if file.filename == "" or file.filename is None:
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": "Only CSV/TSV files are accepted"}), 400

    # ------------------------------------------------------------------
    # Save file to disk
    # ------------------------------------------------------------------
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(upload_folder, safe_name)
    file.save(file_path)

    # ------------------------------------------------------------------
    # Create Upload record in DB (status = processing)
    # ------------------------------------------------------------------
    upload_record = Upload(
        platform="unknown",
        filename=file.filename,
        file_path=file_path,
        status="processing",
        user_id=g.current_user_id,
    )
    db.session.add(upload_record)
    db.session.commit()

    upload_id = upload_record.id

    try:
        # ------------------------------------------------------------------
        # Parse CSV — detect multi-platform
        # ------------------------------------------------------------------
        platform_map = split_by_platform(file_path)
        is_multi = len(platform_map) > 1

        if is_multi:
            file_group_id = str(uuid.uuid4())
            results = []
            for platform, (df, _) in platform_map.items():
                if df.empty:
                    continue
                single_result = _process_single_platform(
                    df, platform, file.filename, file_path, file_group_id
                )
                results.append(single_result)

            # Mark original placeholder upload as done (it was just a proxy)
            upload_record.status = "done"
            upload_record.platform = ",".join(platform_map.keys())
            upload_record.file_group_id = file_group_id
            upload_record.row_count = sum(r["row_count"] for r in results)
            db.session.commit()

            return jsonify({
                "multi_platform": True,
                "file_group_id": file_group_id,
                "platforms": [r["platform"] for r in results],
                "uploads": results,
            }), 200

        # Single platform path
        df, platform = list(platform_map.values())[0]
        if df.empty:
            raise ValueError("The uploaded file contains no parseable data rows.")

        row_count = len(df)

        # ------------------------------------------------------------------
        # Core KPI analytics
        # ------------------------------------------------------------------
        analytics_result = compute_full_analytics(df, platform)

        # ------------------------------------------------------------------
        # Forecasting
        # ------------------------------------------------------------------
        forecast_data = forecast_all(analytics_result)
        analytics_result["forecast_data"] = forecast_data

        # ------------------------------------------------------------------
        # Anomaly detection
        # ------------------------------------------------------------------
        raw_anomalies = detect_anomalies(df, contamination=0.05, analytics_result=analytics_result)
        trend_alerts = generate_trend_alerts(analytics_result)
        all_alerts = raw_anomalies + trend_alerts
        analytics_result["anomalies"] = all_alerts  # list of dicts

        # ------------------------------------------------------------------
        # Audience data
        # ------------------------------------------------------------------
        audience_data = extract_audience_data(df, platform)
        analytics_result["audience_data"] = audience_data

        # ------------------------------------------------------------------
        # Persist Analytics record
        # ------------------------------------------------------------------
        analytics_record = Analytics(
            upload_id=upload_id,
            platform=platform,
            date_range_start=_safe_datetime(analytics_result.get("date_range_start")),
            date_range_end=_safe_datetime(analytics_result.get("date_range_end")),
            total_posts=analytics_result["total_posts"],
            avg_engagement_rate=analytics_result["avg_engagement_rate"],
            median_engagement_rate=analytics_result["median_engagement_rate"],
            er_std=analytics_result["er_std"],
            er_p75=analytics_result["er_p75"],
            er_p90=analytics_result["er_p90"],
            engagement_trend=analytics_result["engagement_trend"],
            total_reach=analytics_result["total_reach"],
            total_impressions=analytics_result["total_impressions"],
            avg_reach_per_post=analytics_result["avg_reach_per_post"],
            avg_impressions_per_post=analytics_result["avg_impressions_per_post"],
            reach_growth_rate=analytics_result["reach_growth_rate"],
            total_likes=analytics_result["total_likes"],
            total_comments=analytics_result["total_comments"],
            total_shares=analytics_result["total_shares"],
            total_saves=analytics_result["total_saves"],
            virality_rate=analytics_result["virality_rate"],
            save_rate=analytics_result["save_rate"],
            comment_rate=analytics_result["comment_rate"],
            follower_count=analytics_result["follower_count"],
            follower_growth=analytics_result["follower_growth"],
            posting_frequency=analytics_result["posting_frequency"],
            best_posting_day=analytics_result["best_posting_day"],
            best_posting_hour=analytics_result["best_posting_hour"],
            top_post_type=analytics_result["top_post_type"],
            caption_length_impact=analytics_result["caption_length_impact"],
            weekly_trend=json.dumps(analytics_result["weekly_trend"]),
            monthly_trend=json.dumps(analytics_result.get("monthly_trend", [])),
            yearly_trend=json.dumps(analytics_result.get("yearly_trend", [])),
            daily_trend=json.dumps(analytics_result["daily_trend"]),
            posting_heatmap=json.dumps(analytics_result["posting_heatmap"]),
            post_type_breakdown=json.dumps(analytics_result["post_type_breakdown"]),
            forecast_data=json.dumps(forecast_data),
            anomalies=json.dumps(all_alerts),
            top_hashtags=json.dumps(analytics_result["top_hashtags"]),
        )
        db.session.add(analytics_record)

        # ------------------------------------------------------------------
        # Persist Post records
        # ------------------------------------------------------------------
        posts_data = analytics_result.get("posts", [])
        for post_dict in posts_data:
            posted_at = _safe_datetime(post_dict.get("posted_at"))
            post_rec = Post(
                upload_id=upload_id,
                platform=platform,
                post_id=post_dict.get("post_id") or None,
                posted_at=posted_at,
                post_type=post_dict.get("post_type") or None,
                caption=post_dict.get("caption") or None,
                likes=post_dict.get("likes", 0),
                comments=post_dict.get("comments", 0),
                shares=post_dict.get("shares", 0),
                saves=post_dict.get("saves", 0),
                reach=post_dict.get("reach", 0),
                impressions=post_dict.get("impressions", 0),
                engagement_rate=post_dict.get("engagement_rate", 0),
                virality_rate=post_dict.get("virality_rate", 0),
                save_rate=post_dict.get("save_rate", 0),
                z_score=post_dict.get("z_score", 0),
                is_anomaly=post_dict.get("is_anomaly", False),
                story_exits=post_dict.get("story_exits"),
                story_replies=post_dict.get("story_replies"),
                video_views=post_dict.get("video_views"),
                video_completion_rate=post_dict.get("video_completion_rate"),
                hashtags=json.dumps(post_dict.get("hashtags", [])),
            )
            db.session.add(post_rec)

        # ------------------------------------------------------------------
        # Persist Alert records
        # ------------------------------------------------------------------
        for alert_dict in all_alerts:
            alert_rec = Alert(
                upload_id=upload_id,
                alert_type=alert_dict.get("alert_type", "anomaly"),
                severity=alert_dict.get("severity", "info"),
                title=alert_dict.get("title", "")[:255],
                description=alert_dict.get("description", ""),
                metric=alert_dict.get("metric", ""),
                value=alert_dict.get("value"),
                baseline=alert_dict.get("baseline"),
                post_id=alert_dict.get("post_id"),
                dismissed=False,
            )
            db.session.add(alert_rec)

        # ------------------------------------------------------------------
        # Update Upload record to done
        # ------------------------------------------------------------------
        upload_record.platform = platform
        upload_record.row_count = row_count
        upload_record.status = "done"
        db.session.commit()

        # ------------------------------------------------------------------
        # Build response payload
        # ------------------------------------------------------------------
        analytics_payload = {
            "upload_id": upload_id,
            "platform": platform,
            # Scalar KPIs
            "total_posts": analytics_result["total_posts"],
            "avg_engagement_rate": analytics_result["avg_engagement_rate"],
            "median_engagement_rate": analytics_result["median_engagement_rate"],
            "er_std": analytics_result["er_std"],
            "er_p75": analytics_result["er_p75"],
            "er_p90": analytics_result["er_p90"],
            "engagement_trend": analytics_result["engagement_trend"],
            "total_reach": analytics_result["total_reach"],
            "total_impressions": analytics_result["total_impressions"],
            "avg_reach_per_post": analytics_result["avg_reach_per_post"],
            "avg_impressions_per_post": analytics_result["avg_impressions_per_post"],
            "reach_growth_rate": analytics_result["reach_growth_rate"],
            "total_likes": analytics_result["total_likes"],
            "total_comments": analytics_result["total_comments"],
            "total_shares": analytics_result["total_shares"],
            "total_saves": analytics_result["total_saves"],
            "virality_rate": analytics_result["virality_rate"],
            "save_rate": analytics_result["save_rate"],
            "comment_rate": analytics_result["comment_rate"],
            "follower_count": analytics_result["follower_count"],
            "follower_growth": analytics_result["follower_growth"],
            "posting_frequency": analytics_result["posting_frequency"],
            "best_posting_day": analytics_result["best_posting_day"],
            "best_posting_hour": analytics_result["best_posting_hour"],
            "top_post_type": analytics_result["top_post_type"],
            "caption_length_impact": analytics_result["caption_length_impact"],
            "date_range_start": analytics_result["date_range_start"],
            "date_range_end": analytics_result["date_range_end"],
            # JSON blobs
            "weekly_trend": analytics_result["weekly_trend"],
            "monthly_trend": analytics_result.get("monthly_trend", []),
            "yearly_trend": analytics_result.get("yearly_trend", []),
            "daily_trend": analytics_result["daily_trend"],
            "posting_heatmap": analytics_result["posting_heatmap"],
            "post_type_breakdown": analytics_result["post_type_breakdown"],
            "top_hashtags": analytics_result["top_hashtags"],
            "forecast_data": forecast_data,
            "anomalies": all_alerts,
            "audience_data": audience_data,
            # Post lists
            "top_posts": analytics_result["top_posts"],
            "worst_posts": analytics_result["worst_posts"],
            "anomaly_posts": analytics_result["anomaly_posts"],
        }

        response_payload = {
            "upload_id": upload_id,
            "platform": platform,
            "row_count": row_count,
            "analytics": analytics_payload,
        }

        return jsonify(response_payload), 200

    except Exception as exc:
        db.session.rollback()
        error_msg = str(exc)
        tb = traceback.format_exc()
        current_app.logger.error(f"Upload processing failed: {error_msg}\n{tb}")

        # Mark upload as error
        try:
            upload_record.status = "error"
            upload_record.error_msg = error_msg[:1000]
            db.session.commit()
        except Exception:
            db.session.rollback()

        return jsonify({
            "error": "Analytics processing failed. Please check your CSV format and try again.",
            "upload_id": upload_id,
        }), 500


def _process_single_platform(df, platform: str, filename: str, file_path: str, file_group_id: str) -> dict:
    """Process one platform's DataFrame and persist to DB. Returns response dict."""
    row_count = len(df)
    upload_rec = Upload(
        platform=platform,
        filename=filename,
        file_path=file_path,
        status="processing",
        file_group_id=file_group_id,
    )
    db.session.add(upload_rec)
    db.session.commit()
    upload_id = upload_rec.id

    analytics_result = compute_full_analytics(df, platform)
    forecast_data = forecast_all(analytics_result)
    analytics_result["forecast_data"] = forecast_data
    raw_anomalies = detect_anomalies(df, contamination=0.05, analytics_result=analytics_result)
    trend_alerts = generate_trend_alerts(analytics_result)
    all_alerts = raw_anomalies + trend_alerts
    analytics_result["anomalies"] = all_alerts
    audience_data = extract_audience_data(df, platform)
    analytics_result["audience_data"] = audience_data

    analytics_record = Analytics(
        upload_id=upload_id,
        platform=platform,
        date_range_start=_safe_datetime(analytics_result.get("date_range_start")),
        date_range_end=_safe_datetime(analytics_result.get("date_range_end")),
        total_posts=analytics_result["total_posts"],
        avg_engagement_rate=analytics_result["avg_engagement_rate"],
        median_engagement_rate=analytics_result["median_engagement_rate"],
        er_std=analytics_result["er_std"],
        er_p75=analytics_result["er_p75"],
        er_p90=analytics_result["er_p90"],
        engagement_trend=analytics_result["engagement_trend"],
        total_reach=analytics_result["total_reach"],
        total_impressions=analytics_result["total_impressions"],
        avg_reach_per_post=analytics_result["avg_reach_per_post"],
        avg_impressions_per_post=analytics_result["avg_impressions_per_post"],
        reach_growth_rate=analytics_result["reach_growth_rate"],
        total_likes=analytics_result["total_likes"],
        total_comments=analytics_result["total_comments"],
        total_shares=analytics_result["total_shares"],
        total_saves=analytics_result["total_saves"],
        virality_rate=analytics_result["virality_rate"],
        save_rate=analytics_result["save_rate"],
        comment_rate=analytics_result["comment_rate"],
        follower_count=analytics_result["follower_count"],
        follower_growth=analytics_result["follower_growth"],
        posting_frequency=analytics_result["posting_frequency"],
        best_posting_day=analytics_result["best_posting_day"],
        best_posting_hour=analytics_result["best_posting_hour"],
        top_post_type=analytics_result["top_post_type"],
        caption_length_impact=analytics_result["caption_length_impact"],
        weekly_trend=json.dumps(analytics_result["weekly_trend"]),
        monthly_trend=json.dumps(analytics_result.get("monthly_trend", [])),
        yearly_trend=json.dumps(analytics_result.get("yearly_trend", [])),
        daily_trend=json.dumps(analytics_result["daily_trend"]),
        posting_heatmap=json.dumps(analytics_result["posting_heatmap"]),
        post_type_breakdown=json.dumps(analytics_result["post_type_breakdown"]),
        forecast_data=json.dumps(forecast_data),
        anomalies=json.dumps(all_alerts),
        top_hashtags=json.dumps(analytics_result["top_hashtags"]),
    )
    db.session.add(analytics_record)

    for post_dict in analytics_result.get("posts", []):
        post_rec = Post(
            upload_id=upload_id, platform=platform,
            post_id=post_dict.get("post_id") or None,
            posted_at=_safe_datetime(post_dict.get("posted_at")),
            post_type=post_dict.get("post_type") or None,
            caption=post_dict.get("caption") or None,
            likes=post_dict.get("likes", 0), comments=post_dict.get("comments", 0),
            shares=post_dict.get("shares", 0), saves=post_dict.get("saves", 0),
            reach=post_dict.get("reach", 0), impressions=post_dict.get("impressions", 0),
            engagement_rate=post_dict.get("engagement_rate", 0),
            virality_rate=post_dict.get("virality_rate", 0),
            save_rate=post_dict.get("save_rate", 0),
            z_score=post_dict.get("z_score", 0),
            is_anomaly=post_dict.get("is_anomaly", False),
            story_exits=post_dict.get("story_exits"),
            story_replies=post_dict.get("story_replies"),
            video_views=post_dict.get("video_views"),
            video_completion_rate=post_dict.get("video_completion_rate"),
            hashtags=json.dumps(post_dict.get("hashtags", [])),
        )
        db.session.add(post_rec)

    for alert_dict in all_alerts:
        db.session.add(Alert(
            upload_id=upload_id,
            alert_type=alert_dict.get("alert_type", "anomaly"),
            severity=alert_dict.get("severity", "info"),
            title=alert_dict.get("title", "")[:255],
            description=alert_dict.get("description", ""),
            metric=alert_dict.get("metric", ""),
            value=alert_dict.get("value"),
            baseline=alert_dict.get("baseline"),
            post_id=alert_dict.get("post_id"),
            dismissed=False,
        ))

    upload_rec.platform = platform
    upload_rec.row_count = row_count
    upload_rec.status = "done"
    db.session.commit()

    return {
        "upload_id": upload_id,
        "platform": platform,
        "row_count": row_count,
        "analytics": {
            "upload_id": upload_id, "platform": platform,
            "total_posts": analytics_result["total_posts"],
            "avg_engagement_rate": analytics_result["avg_engagement_rate"],
            "median_engagement_rate": analytics_result["median_engagement_rate"],
            "er_std": analytics_result["er_std"],
            "er_p75": analytics_result["er_p75"],
            "er_p90": analytics_result["er_p90"],
            "engagement_trend": analytics_result["engagement_trend"],
            "total_reach": analytics_result["total_reach"],
            "total_impressions": analytics_result["total_impressions"],
            "avg_reach_per_post": analytics_result["avg_reach_per_post"],
            "avg_impressions_per_post": analytics_result["avg_impressions_per_post"],
            "reach_growth_rate": analytics_result["reach_growth_rate"],
            "total_likes": analytics_result["total_likes"],
            "total_comments": analytics_result["total_comments"],
            "total_shares": analytics_result["total_shares"],
            "total_saves": analytics_result["total_saves"],
            "virality_rate": analytics_result["virality_rate"],
            "save_rate": analytics_result["save_rate"],
            "comment_rate": analytics_result["comment_rate"],
            "follower_count": analytics_result["follower_count"],
            "follower_growth": analytics_result["follower_growth"],
            "posting_frequency": analytics_result["posting_frequency"],
            "best_posting_day": analytics_result["best_posting_day"],
            "best_posting_hour": analytics_result["best_posting_hour"],
            "top_post_type": analytics_result["top_post_type"],
            "caption_length_impact": analytics_result["caption_length_impact"],
            "date_range_start": analytics_result["date_range_start"],
            "date_range_end": analytics_result["date_range_end"],
            "weekly_trend": analytics_result["weekly_trend"],
            "monthly_trend": analytics_result.get("monthly_trend", []),
            "yearly_trend": analytics_result.get("yearly_trend", []),
            "daily_trend": analytics_result["daily_trend"],
            "posting_heatmap": analytics_result["posting_heatmap"],
            "post_type_breakdown": analytics_result["post_type_breakdown"],
            "top_hashtags": analytics_result["top_hashtags"],
            "forecast_data": forecast_data,
            "anomalies": all_alerts,
            "audience_data": audience_data,
            "top_posts": analytics_result["top_posts"],
            "worst_posts": analytics_result["worst_posts"],
            "anomaly_posts": analytics_result["anomaly_posts"],
        },
    }
