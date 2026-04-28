"""
SQLAlchemy ORM models for the SMM Analytics Platform.
All models include a to_dict() method for JSON serialisation.
"""

import uuid
import json
from datetime import datetime, timezone

from . import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.String(36), primary_key=True, default=_uuid)
    email         = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name          = db.Column(db.String(255), nullable=True)
    token_version = db.Column(db.Integer, default=0, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at    = db.Column(db.DateTime, default=_now)

    uploads = db.relationship("Upload", backref="user", lazy=True)

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "email":         self.email,
            "name":          self.name,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

class Upload(db.Model):
    __tablename__ = "uploads"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    platform = db.Column(db.String(50), nullable=False, default="generic")
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(512), nullable=False)
    row_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), nullable=False, default="processing")  # processing|done|error
    error_msg = db.Column(db.Text, nullable=True)
    file_group_id = db.Column(db.String(36), nullable=True)  # links multi-platform splits from same file
    user_id    = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)

    # Relationships
    analytics = db.relationship("Analytics", backref="upload", uselist=False, cascade="all, delete-orphan")
    posts = db.relationship("Post", backref="upload", cascade="all, delete-orphan")
    ai_insights = db.relationship("AIInsight", backref="upload", cascade="all, delete-orphan")
    alerts = db.relationship("Alert", backref="upload", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "platform": self.platform,
            "filename": self.filename,
            "row_count": self.row_count,
            "status": self.status,
            "error_msg": self.error_msg,
            "file_group_id": self.file_group_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class Analytics(db.Model):
    __tablename__ = "analytics"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    upload_id = db.Column(db.String(36), db.ForeignKey("uploads.id"), nullable=False, unique=True)
    platform = db.Column(db.String(50), nullable=False, default="generic")

    # Date range
    date_range_start = db.Column(db.DateTime, nullable=True)
    date_range_end = db.Column(db.DateTime, nullable=True)

    # Volume
    total_posts = db.Column(db.Integer, default=0)

    # Engagement
    avg_engagement_rate = db.Column(db.Float, default=0.0)
    median_engagement_rate = db.Column(db.Float, default=0.0)
    er_std = db.Column(db.Float, default=0.0)
    er_p75 = db.Column(db.Float, default=0.0)
    er_p90 = db.Column(db.Float, default=0.0)
    engagement_trend = db.Column(db.String(10), default="flat")  # up|flat|down

    # Reach / Impressions
    total_reach = db.Column(db.Float, default=0.0)
    total_impressions = db.Column(db.Float, default=0.0)
    avg_reach_per_post = db.Column(db.Float, default=0.0)
    avg_impressions_per_post = db.Column(db.Float, default=0.0)
    reach_growth_rate = db.Column(db.Float, default=0.0)

    # Interactions
    total_likes = db.Column(db.Float, default=0.0)
    total_comments = db.Column(db.Float, default=0.0)
    total_shares = db.Column(db.Float, default=0.0)
    total_saves = db.Column(db.Float, default=0.0)

    # Derived rates
    virality_rate = db.Column(db.Float, default=0.0)
    save_rate = db.Column(db.Float, default=0.0)
    comment_rate = db.Column(db.Float, default=0.0)

    # Followers
    follower_count = db.Column(db.Float, default=0.0)
    follower_growth = db.Column(db.Float, default=0.0)

    # Posting patterns
    posting_frequency = db.Column(db.Float, default=0.0)
    best_posting_day = db.Column(db.Integer, default=0)   # 0=Mon … 6=Sun
    best_posting_hour = db.Column(db.Integer, default=12)
    top_post_type = db.Column(db.String(50), default="")

    # Caption analysis
    caption_length_impact = db.Column(db.Float, default=0.0)

    # JSON blobs (stored as Text)
    weekly_trend = db.Column(db.Text, default="[]")
    monthly_trend = db.Column(db.Text, default="[]")
    yearly_trend = db.Column(db.Text, default="[]")
    daily_trend = db.Column(db.Text, default="[]")
    posting_heatmap = db.Column(db.Text, default="[]")
    post_type_breakdown = db.Column(db.Text, default="{}")
    forecast_data = db.Column(db.Text, default="{}")
    anomalies = db.Column(db.Text, default="[]")
    top_hashtags = db.Column(db.Text, default="[]")

    created_at = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        def _load(val, default):
            if val is None:
                return default
            try:
                return json.loads(val)
            except Exception:
                return default

        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "platform": self.platform,
            "date_range_start": self.date_range_start.isoformat() if self.date_range_start else None,
            "date_range_end": self.date_range_end.isoformat() if self.date_range_end else None,
            "total_posts": self.total_posts,
            "avg_engagement_rate": self.avg_engagement_rate,
            "median_engagement_rate": self.median_engagement_rate,
            "er_std": self.er_std,
            "er_p75": self.er_p75,
            "er_p90": self.er_p90,
            "engagement_trend": self.engagement_trend,
            "total_reach": self.total_reach,
            "total_impressions": self.total_impressions,
            "avg_reach_per_post": self.avg_reach_per_post,
            "avg_impressions_per_post": self.avg_impressions_per_post,
            "reach_growth_rate": self.reach_growth_rate,
            "total_likes": self.total_likes,
            "total_comments": self.total_comments,
            "total_shares": self.total_shares,
            "total_saves": self.total_saves,
            "virality_rate": self.virality_rate,
            "save_rate": self.save_rate,
            "comment_rate": self.comment_rate,
            "follower_count": self.follower_count,
            "follower_growth": self.follower_growth,
            "posting_frequency": self.posting_frequency,
            "best_posting_day": self.best_posting_day,
            "best_posting_hour": self.best_posting_hour,
            "top_post_type": self.top_post_type,
            "caption_length_impact": self.caption_length_impact,
            "weekly_trend": _load(self.weekly_trend, []),
            "monthly_trend": _load(self.monthly_trend, []),
            "yearly_trend": _load(self.yearly_trend, []),
            "daily_trend": _load(self.daily_trend, []),
            "posting_heatmap": _load(self.posting_heatmap, []),
            "post_type_breakdown": _load(self.post_type_breakdown, {}),
            "forecast_data": _load(self.forecast_data, {}),
            "anomalies": _load(self.anomalies, []),
            "top_hashtags": _load(self.top_hashtags, []),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Post
# ---------------------------------------------------------------------------

class Post(db.Model):
    __tablename__ = "posts"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    upload_id = db.Column(db.String(36), db.ForeignKey("uploads.id"), nullable=False)
    platform = db.Column(db.String(50), nullable=False, default="generic")
    post_id = db.Column(db.String(255), nullable=True)  # original platform post ID
    posted_at = db.Column(db.DateTime, nullable=True)
    post_type = db.Column(db.String(50), nullable=True)
    caption = db.Column(db.Text, nullable=True)

    # Core metrics
    likes = db.Column(db.Float, default=0.0)
    comments = db.Column(db.Float, default=0.0)
    shares = db.Column(db.Float, default=0.0)
    saves = db.Column(db.Float, default=0.0)
    reach = db.Column(db.Float, default=0.0)
    impressions = db.Column(db.Float, default=0.0)

    # Derived
    engagement_rate = db.Column(db.Float, default=0.0)
    virality_rate = db.Column(db.Float, default=0.0)
    save_rate = db.Column(db.Float, default=0.0)

    # Anomaly
    z_score = db.Column(db.Float, default=0.0)
    is_anomaly = db.Column(db.Boolean, default=False)

    # Platform-specific
    story_exits = db.Column(db.Float, nullable=True)
    story_replies = db.Column(db.Float, nullable=True)
    video_views = db.Column(db.Float, nullable=True)
    video_completion_rate = db.Column(db.Float, nullable=True)

    # JSON blob
    hashtags = db.Column(db.Text, default="[]")  # list of hashtag strings

    def to_dict(self) -> dict:
        def _load(val, default):
            if val is None:
                return default
            try:
                return json.loads(val)
            except Exception:
                return default

        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "platform": self.platform,
            "post_id": self.post_id,
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
            "post_type": self.post_type,
            "caption": self.caption,
            "likes": self.likes,
            "comments": self.comments,
            "shares": self.shares,
            "saves": self.saves,
            "reach": self.reach,
            "impressions": self.impressions,
            "engagement_rate": self.engagement_rate,
            "virality_rate": self.virality_rate,
            "save_rate": self.save_rate,
            "z_score": self.z_score,
            "is_anomaly": self.is_anomaly,
            "story_exits": self.story_exits,
            "story_replies": self.story_replies,
            "video_views": self.video_views,
            "video_completion_rate": self.video_completion_rate,
            "hashtags": _load(self.hashtags, []),
        }


# ---------------------------------------------------------------------------
# AIInsight
# ---------------------------------------------------------------------------

class AIInsight(db.Model):
    __tablename__ = "ai_insights"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    upload_id = db.Column(db.String(36), db.ForeignKey("uploads.id"), nullable=False)
    insight_type = db.Column(db.String(50), nullable=False, default="full_analysis")
    content = db.Column(db.Text, nullable=False, default="{}")  # JSON blob
    model_used = db.Column(db.String(100), nullable=True)
    tokens_used = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        try:
            content_parsed = json.loads(self.content)
        except Exception:
            content_parsed = {}
        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "insight_type": self.insight_type,
            "content": content_parsed,
            "model_used": self.model_used,
            "tokens_used": self.tokens_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Alert
# ---------------------------------------------------------------------------

class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    upload_id = db.Column(db.String(36), db.ForeignKey("uploads.id"), nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)  # anomaly|threshold|trend|milestone
    severity = db.Column(db.String(10), nullable=False)    # critical|warning|info|good
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    metric = db.Column(db.String(100), nullable=True)
    value = db.Column(db.Float, nullable=True)
    baseline = db.Column(db.Float, nullable=True)
    post_id = db.Column(db.String(36), nullable=True)  # optional reference to Post.id
    dismissed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "metric": self.metric,
            "value": self.value,
            "baseline": self.baseline,
            "post_id": self.post_id,
            "dismissed": self.dismissed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Goal
# ---------------------------------------------------------------------------

class Goal(db.Model):
    __tablename__ = "goals"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    name = db.Column(db.String(255), nullable=False)
    metric = db.Column(db.String(100), nullable=False)
    target = db.Column(db.Float, nullable=False)
    current = db.Column(db.Float, default=0.0)
    deadline = db.Column(db.DateTime, nullable=True)
    platform = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)

    def to_dict(self) -> dict:
        progress_pct = 0.0
        if self.target and self.target > 0:
            progress_pct = round(min((self.current / self.target) * 100, 100), 2)
        return {
            "id": self.id,
            "name": self.name,
            "metric": self.metric,
            "target": self.target,
            "current": self.current,
            "progress_pct": progress_pct,
            "deadline": self.deadline.isoformat() if self.deadline else None,
            "platform": self.platform,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
