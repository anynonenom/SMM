"""
Post routes – paginated, filterable post retrieval.
"""

from __future__ import annotations

import json

from flask import Blueprint, jsonify, request

from .. import db
from ..utils.auth import require_auth
from ..models import Post, Analytics, Upload
from sqlalchemy import asc, desc

posts_bp = Blueprint("posts", __name__)

_SORT_COLS = {
    "engagement_rate": Post.engagement_rate,
    "likes": Post.likes,
    "comments": Post.comments,
    "shares": Post.shares,
    "saves": Post.saves,
    "reach": Post.reach,
    "impressions": Post.impressions,
    "virality_rate": Post.virality_rate,
    "save_rate": Post.save_rate,
    "z_score": Post.z_score,
    "posted_at": Post.posted_at,
}


def _check_upload(upload_id: str):
    """Return (upload, error_response) tuple."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return None, (jsonify({"error": "Upload not found"}), 404)
    if upload.status != "done":
        return None, (jsonify({"error": "Upload processing not complete", "status": upload.status}), 202)
    return upload, None


# ---------------------------------------------------------------------------
# GET /api/posts/<upload_id>
# ---------------------------------------------------------------------------

@posts_bp.route("/api/posts/<upload_id>", methods=["GET"])
@require_auth
def get_posts(upload_id: str):
    """
    Return paginated, sortable posts for an upload.

    Query parameters:
        sort     – column name (default: posted_at)
        dir      – asc | desc (default: desc)
        page     – page number (1-indexed, default: 1)
        limit    – records per page (default: 50, max: 200)
        type     – filter by post_type (optional)
        search   – search in caption (case-insensitive, optional)
        anomaly  – 'true' to return only anomalous posts
    """
    upload, err = _check_upload(upload_id)
    if err:
        return err

    sort_col_name = request.args.get("sort", "posted_at")
    sort_dir = request.args.get("dir", "desc").lower()
    try:
        page = max(int(request.args.get("page", 1)), 1)
    except ValueError:
        page = 1
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except ValueError:
        limit = 50

    post_type_filter = request.args.get("type", "").strip()
    search_term = request.args.get("search", "").strip()
    anomaly_only = request.args.get("anomaly", "").lower() == "true"

    # Base query
    query = Post.query.filter_by(upload_id=upload_id)

    # Filters
    if post_type_filter:
        query = query.filter(Post.post_type.ilike(f"%{post_type_filter}%"))

    if search_term:
        query = query.filter(Post.caption.ilike(f"%{search_term}%"))

    if anomaly_only:
        query = query.filter(Post.is_anomaly.is_(True))

    # Sorting
    sort_col = _SORT_COLS.get(sort_col_name, Post.posted_at)
    if sort_dir == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    # Pagination
    total = query.count()
    posts = query.offset((page - 1) * limit).limit(limit).all()
    posts_list = [p.to_dict() for p in posts]

    return jsonify({
        "upload_id": upload_id,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "posts": posts_list,
    }), 200


# ---------------------------------------------------------------------------
# GET /api/posts/<upload_id>/top
# ---------------------------------------------------------------------------

@posts_bp.route("/api/posts/<upload_id>/top", methods=["GET"])
@require_auth
def get_top_posts(upload_id: str):
    """Return top 10 posts by engagement rate."""
    upload, err = _check_upload(upload_id)
    if err:
        return err

    top_n = int(request.args.get("n", 10))
    top_n = min(max(top_n, 1), 50)

    posts = (
        Post.query.filter_by(upload_id=upload_id)
        .order_by(desc(Post.engagement_rate))
        .limit(top_n)
        .all()
    )
    return jsonify({
        "upload_id": upload_id,
        "posts": [p.to_dict() for p in posts],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/posts/<upload_id>/anomalies
# ---------------------------------------------------------------------------

@posts_bp.route("/api/posts/<upload_id>/anomalies", methods=["GET"])
@require_auth
def get_anomaly_posts(upload_id: str):
    """Return posts flagged as anomalies."""
    upload, err = _check_upload(upload_id)
    if err:
        return err

    posts = (
        Post.query.filter_by(upload_id=upload_id)
        .filter(Post.is_anomaly.is_(True))
        .order_by(desc(Post.z_score.cast(db.Float)))
        .all()
    )
    return jsonify({
        "upload_id": upload_id,
        "count": len(posts),
        "posts": [p.to_dict() for p in posts],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/posts/<upload_id>/heatmap
# ---------------------------------------------------------------------------

@posts_bp.route("/api/posts/<upload_id>/heatmap", methods=["GET"])
@require_auth
def get_heatmap(upload_id: str):
    """Return posting time heatmap data (day × hour grid)."""
    upload, err = _check_upload(upload_id)
    if err:
        return err

    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    if analytics is None:
        return jsonify({"error": "Analytics not found"}), 404

    heatmap_raw = analytics.posting_heatmap
    try:
        heatmap = json.loads(heatmap_raw) if heatmap_raw else []
    except Exception:
        heatmap = []

    return jsonify({
        "upload_id": upload_id,
        "heatmap": heatmap,
        "best_posting_day": analytics.best_posting_day,
        "best_posting_hour": analytics.best_posting_hour,
    }), 200
