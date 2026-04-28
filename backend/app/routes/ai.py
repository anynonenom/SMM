"""
AI routes – LLM-powered insights, captions, and hashtag strategy.
"""

from __future__ import annotations

import html
import json
import re
import traceback
from io import BytesIO

from flask import Blueprint, current_app, jsonify, request, send_file

from .. import db
from ..utils.auth import require_auth
from ..models import AIInsight, Analytics, Post, Upload
from ..ai.openrouter import (
    generate_full_insights,
    generate_post_explanation,
    generate_captions,
    generate_hashtag_strategy,
    generate_html_report,
    resolve_ai_provider_model,
)

ai_bp = Blueprint("ai", __name__)


def _get_api_key() -> str:
    key = (
        current_app.config.get("AI_API_KEY")
        or current_app.config.get("OPENROUTER_API_KEY")
        or current_app.config.get("GEMINI_API_KEY")
        or current_app.config.get("GROQ_API_KEY")
        or current_app.config.get("ANTHROPIC_API_KEY")
        or ""
    ).strip()
    if not key:
        raise ValueError(
            "AI key is not configured. Set AI_API_KEY or one of: "
            "GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY."
        )
    return key


def _check_upload_done(upload_id: str):
    """Return (upload, analytics, error_response)."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return None, None, (jsonify({"error": "Upload not found"}), 404)
    if upload.status != "done":
        return None, None, (jsonify({"error": "Upload not processed yet"}), 202)
    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    if analytics is None:
        return upload, None, (jsonify({"error": "Analytics record missing"}), 404)
    return upload, analytics, None


def _analytics_to_dict(analytics) -> dict:
    """Convert Analytics ORM object to full dict with parsed JSON fields."""
    d = analytics.to_dict()
    return d


def _parse_json_field(val, default):
    if val is None:
        return default
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


def _build_or_get_html_report(upload_id: str, analytics, force: bool = False) -> tuple[str, str, bool, str | None]:
    """Return (html_report, model_used, cached, created_at_iso)."""
    if not force:
        cached = (
            AIInsight.query.filter_by(upload_id=upload_id, insight_type="html_report")
            .order_by(AIInsight.created_at.desc())
            .first()
        )
        if cached:
            parsed = _parse_json_field(cached.content, {})
            if isinstance(parsed, dict) and parsed.get("html"):
                return (
                    str(parsed["html"]),
                    cached.model_used or "",
                    True,
                    cached.created_at.isoformat() if cached.created_at else None,
                )

    api_key = _get_api_key()
    _, model_used = resolve_ai_provider_model(api_key)

    analytics_dict = _analytics_to_dict(analytics)
    top_posts = sorted(
        [p.to_dict() for p in Post.query.filter_by(upload_id=upload_id).all()],
        key=lambda p: p.get("engagement_rate", 0),
        reverse=True,
    )[:10]
    anomalies_raw = _parse_json_field(analytics.anomalies, [])

    latest_insights = (
        AIInsight.query.filter_by(upload_id=upload_id, insight_type="full_analysis")
        .order_by(AIInsight.created_at.desc())
        .first()
    )
    insights_context = {}
    if latest_insights:
        parsed_insights = _parse_json_field(latest_insights.content, {})
        if isinstance(parsed_insights, dict):
            insights_context = parsed_insights

    report_html = generate_html_report(
        api_key=api_key,
        analytics=analytics_dict,
        top_posts=top_posts,
        anomalies=anomalies_raw,
        insights=insights_context,
    )

    record = AIInsight(
        upload_id=upload_id,
        insight_type="html_report",
        content=json.dumps({"html": report_html}),
        model_used=model_used,
        tokens_used=0,
    )
    db.session.add(record)
    db.session.commit()

    return report_html, model_used, False, (record.created_at.isoformat() if record.created_at else None)


def _html_to_text_lines(report_html: str) -> list[str]:
    """Convert HTML report to plain wrapped lines for PDF rendering."""
    txt = report_html or ""
    txt = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", txt)
    txt = re.sub(r"(?i)<br\s*/?>", "\n", txt)
    txt = re.sub(r"(?i)</(h1|h2|h3|h4|h5|h6|p|div|li|tr|section|article|table|thead|tbody)>", "\n", txt)
    txt = re.sub(r"(?i)<li[^>]*>", "• ", txt)
    txt = re.sub(r"<[^>]+>", "", txt)
    txt = html.unescape(txt)
    lines = []
    for line in txt.splitlines():
        compact = re.sub(r"\s+", " ", line).strip()
        if compact:
            lines.append(compact)
    return lines


def _render_pdf_from_html(report_html: str, title: str = "SMM Analytics Report") -> bytes:
    """
    Render a simple PDF from report HTML.
    Uses reportlab if available.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.utils import simpleSplit
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise RuntimeError("PDF export requires `reportlab` to be installed on the backend.") from exc

    lines = _html_to_text_lines(report_html)
    if not lines:
        lines = ["No report content available."]

    margin_x = 40
    margin_y = 42
    line_height = 14
    body_font = "Helvetica"
    body_size = 10

    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - margin_y

    pdf.setTitle(title)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(margin_x, y, title)
    y -= 20

    pdf.setFont(body_font, body_size)
    usable_width = width - (margin_x * 2)

    for line in lines:
        wrapped = simpleSplit(line, body_font, body_size, usable_width)
        for part in wrapped:
            if y <= margin_y:
                pdf.showPage()
                y = height - margin_y
                pdf.setFont(body_font, body_size)
            pdf.drawString(margin_x, y, part)
            y -= line_height

    pdf.save()
    buf.seek(0)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# POST /api/ai/insights
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/insights", methods=["POST"])
@require_auth
def generate_insights():
    """
    Generate full AI insights for an upload.
    Body: {"upload_id": "<id>", "force": false}
    """
    body = request.get_json(silent=True) or {}
    upload_id = body.get("upload_id", "").strip()
    force = body.get("force", False)

    if not upload_id:
        return jsonify({"error": "upload_id is required"}), 400

    upload, analytics, err = _check_upload_done(upload_id)
    if err:
        return err

    # Return cached if exists and not forced
    if not force:
        existing = (
            AIInsight.query.filter_by(upload_id=upload_id, insight_type="full_analysis")
            .order_by(AIInsight.created_at.desc())
            .first()
        )
        if existing:
            return jsonify({
                "upload_id": upload_id,
                "cached": True,
                "insight": existing.to_dict(),
            }), 200

    try:
        api_key = _get_api_key()
    except ValueError as e:
        return jsonify({"error": str(e)}), 503
    _, model_used = resolve_ai_provider_model(api_key)

    # Build analytics context
    analytics_dict = _analytics_to_dict(analytics)
    top_posts = sorted(
        [p.to_dict() for p in Post.query.filter_by(upload_id=upload_id).all()],
        key=lambda p: p.get("engagement_rate", 0),
        reverse=True,
    )[:10]
    anomalies_raw = _parse_json_field(analytics.anomalies, [])
    forecast_data = _parse_json_field(analytics.forecast_data, {})

    try:
        insights = generate_full_insights(
            api_key=api_key,
            analytics=analytics_dict,
            top_posts=top_posts,
            anomalies=anomalies_raw,
            forecast=forecast_data,
        )
    except Exception as exc:
        current_app.logger.error(f"AI insights generation failed: {exc}\n{traceback.format_exc()}")
        return jsonify({"error": "AI generation failed. Please try again or check your API key configuration."}), 500

    # Persist
    insight_record = AIInsight(
        upload_id=upload_id,
        insight_type="full_analysis",
        content=json.dumps(insights),
        model_used=model_used,
        tokens_used=0,
    )
    db.session.add(insight_record)
    db.session.commit()

    return jsonify({
        "upload_id": upload_id,
        "cached": False,
        "insight": insight_record.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/ai/insights/<upload_id>
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/insights/<upload_id>", methods=["GET"])
@require_auth
def get_cached_insights(upload_id: str):
    """Return cached AI insights or {cached: false}."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404

    insight = (
        AIInsight.query.filter_by(upload_id=upload_id, insight_type="full_analysis")
        .order_by(AIInsight.created_at.desc())
        .first()
    )
    if insight is None:
        return jsonify({"upload_id": upload_id, "cached": False}), 200

    return jsonify({
        "upload_id": upload_id,
        "cached": True,
        "insight": insight.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# POST /api/ai/report/html
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/report/html", methods=["POST"])
@require_auth
def generate_html_report_route():
    """
    Generate/cached HTML report for an upload.
    Body: {"upload_id": "<id>", "force": false}
    """
    body = request.get_json(silent=True) or {}
    upload_id = str(body.get("upload_id", "")).strip()
    force = bool(body.get("force", False))

    if not upload_id:
        return jsonify({"error": "upload_id is required"}), 400

    _, analytics, err = _check_upload_done(upload_id)
    if err:
        return err

    try:
        report_html, model_used, cached, created_at = _build_or_get_html_report(
            upload_id=upload_id,
            analytics=analytics,
            force=force,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as exc:
        current_app.logger.error(f"HTML report generation failed: {exc}\n{traceback.format_exc()}")
        return jsonify({"error": "AI report generation failed", "detail": str(exc)}), 500

    return jsonify({
        "upload_id": upload_id,
        "cached": cached,
        "model_used": model_used,
        "created_at": created_at,
        "report_html": report_html,
    }), 200


# ---------------------------------------------------------------------------
# GET /api/ai/report/html/<upload_id>
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/report/html/<upload_id>", methods=["GET"])
@require_auth
def get_cached_html_report(upload_id: str):
    """Return cached HTML report if available, else {cached: false}."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404

    cached = (
        AIInsight.query.filter_by(upload_id=upload_id, insight_type="html_report")
        .order_by(AIInsight.created_at.desc())
        .first()
    )
    if not cached:
        return jsonify({"upload_id": upload_id, "cached": False}), 200

    parsed = _parse_json_field(cached.content, {})
    report_html = parsed.get("html") if isinstance(parsed, dict) else None
    if not report_html:
        return jsonify({"upload_id": upload_id, "cached": False}), 200

    return jsonify({
        "upload_id": upload_id,
        "cached": True,
        "model_used": cached.model_used,
        "created_at": cached.created_at.isoformat() if cached.created_at else None,
        "report_html": report_html,
    }), 200


# ---------------------------------------------------------------------------
# GET /api/ai/report/pdf/<upload_id>
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/report/pdf/<upload_id>", methods=["GET"])
@require_auth
def download_pdf_report(upload_id: str):
    """
    Build and download a PDF report from HTML report content.
    Query param: force=true|false (default false)
    """
    force = str(request.args.get("force", "false")).strip().lower() in {"1", "true", "yes"}

    _, analytics, err = _check_upload_done(upload_id)
    if err:
        return err

    try:
        report_html, _, _, _ = _build_or_get_html_report(
            upload_id=upload_id,
            analytics=analytics,
            force=force,
        )
        pdf_bytes = _render_pdf_from_html(
            report_html,
            title=f"SMM Analytics Report — {str(analytics.platform).upper()}",
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 503
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as exc:
        current_app.logger.error(f"PDF report generation failed: {exc}\n{traceback.format_exc()}")
        return jsonify({"error": "PDF generation failed", "detail": str(exc)}), 500

    filename = f"smm-report-{upload_id}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# ---------------------------------------------------------------------------
# POST /api/ai/explain-post
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/explain-post", methods=["POST"])
@require_auth
def explain_post():
    """
    Explain why a single post over/underperformed.
    Body: {"post_id": "<db_id>", "upload_id": "<id>"}
    """
    body = request.get_json(silent=True) or {}
    post_db_id = body.get("post_id", "").strip()
    upload_id = body.get("upload_id", "").strip()

    if not post_db_id:
        return jsonify({"error": "post_id is required"}), 400
    if not upload_id:
        return jsonify({"error": "upload_id is required"}), 400

    post = Post.query.get(post_db_id)
    if post is None:
        return jsonify({"error": "Post not found"}), 404

    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    avg_er = analytics.avg_engagement_rate if analytics else 0.0
    platform = post.platform

    try:
        api_key = _get_api_key()
    except ValueError as e:
        return jsonify({"error": str(e)}), 503

    try:
        explanation = generate_post_explanation(
            api_key=api_key,
            post=post.to_dict(),
            avg_er=avg_er,
            platform=platform,
        )
    except Exception as exc:
        current_app.logger.error(f"Post explanation failed: {exc}")
        return jsonify({"error": "AI generation failed. Please try again or check your API key configuration."}), 500

    return jsonify({
        "post_id": post_db_id,
        "explanation": explanation,
    }), 200


# ---------------------------------------------------------------------------
# POST /api/ai/captions
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/captions", methods=["POST"])
@require_auth
def generate_captions_route():
    """
    Generate caption variants.
    Body: {
        "topic": "...",
        "tone": "professional|casual|funny|inspirational",
        "platform": "instagram|tiktok|...",
        "count": 3,
        "upload_id": "<optional>"
    }
    """
    body = request.get_json(silent=True) or {}
    topic = body.get("topic", "").strip()
    tone = body.get("tone", "casual").strip()
    platform = body.get("platform", "instagram").strip()
    upload_id = body.get("upload_id", "").strip()

    try:
        count = min(int(body.get("count", 3)), 10)
    except (ValueError, TypeError):
        count = 3

    if not topic:
        return jsonify({"error": "topic is required"}), 400

    try:
        api_key = _get_api_key()
    except ValueError as e:
        return jsonify({"error": str(e)}), 503

    # Attach analytics context if upload_id provided
    analytics_context = None
    if upload_id:
        analytics = Analytics.query.filter_by(upload_id=upload_id).first()
        if analytics:
            analytics_context = {
                "avg_engagement_rate": analytics.avg_engagement_rate,
                "top_post_type": analytics.top_post_type,
                "caption_length_impact": analytics.caption_length_impact,
                "top_hashtags": _parse_json_field(analytics.top_hashtags, []),
            }

    try:
        captions = generate_captions(
            api_key=api_key,
            topic=topic,
            tone=tone,
            platform=platform,
            count=count,
            analytics_context=analytics_context,
        )
    except Exception as exc:
        current_app.logger.error(f"Caption generation failed: {exc}")
        return jsonify({"error": "AI generation failed. Please try again or check your API key configuration."}), 500

    return jsonify({
        "topic": topic,
        "tone": tone,
        "platform": platform,
        "count": len(captions),
        "captions": captions,
    }), 200

# ---------------------------------------------------------------------------
# POST /api/ai/hashtags
# ---------------------------------------------------------------------------

@ai_bp.route("/api/ai/hashtags", methods=["POST"])
@require_auth
def generate_hashtags_route():
    """
    Generate hashtag strategy.
    Body: {
        "platform": "instagram",
        "niche": "fitness",
        "upload_id": "<optional>"
    }
    """
    body = request.get_json(silent=True) or {}
    platform = body.get("platform", "instagram").strip()
    niche = body.get("niche", "").strip()
    upload_id = body.get("upload_id", "").strip()

    if not niche:
        return jsonify({"error": "niche is required"}), 400

    try:
        api_key = _get_api_key()
    except ValueError as e:
        return jsonify({"error": str(e)}), 503

    # Get top hashtags from existing analytics if available
    top_hashtags = []
    if upload_id:
        analytics = Analytics.query.filter_by(upload_id=upload_id).first()
        if analytics:
            top_hashtags = _parse_json_field(analytics.top_hashtags, [])

    try:
        strategy = generate_hashtag_strategy(
            api_key=api_key,
            platform=platform,
            niche=niche,
            top_hashtags=top_hashtags,
        )
    except Exception as exc:
        current_app.logger.error(f"Hashtag strategy failed: {exc}")
        return jsonify({"error": "AI generation failed. Please try again or check your API key configuration."}), 500

    return jsonify({
        "platform": platform,
        "niche": niche,
        "strategy": strategy,
    }), 200
