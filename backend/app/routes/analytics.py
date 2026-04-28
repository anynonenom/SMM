"""
Analytics routes – read-only analytics data retrieval.
"""

from __future__ import annotations

import json
from datetime import datetime
from io import BytesIO

from flask import Blueprint, g, jsonify, current_app, send_file

from .. import db
from ..models import Analytics, Upload, Post
from ..analytics.forecasting import forecast_all
from ..utils.auth import require_auth

analytics_bp = Blueprint("analytics", __name__)


def _parse_json_field(val, default):
    if val is None:
        return default
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


# ---------------------------------------------------------------------------
# GET /api/
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/", methods=["GET"])
def api_root():
    return jsonify({
        "name": "SMM Analytics Platform API",
        "version": "1.0.0",
        "endpoints": [
            "POST /api/upload",
            "GET  /api/uploads",
            "GET  /api/analytics/<upload_id>",
            "DELETE /api/uploads/<upload_id>",
            "GET  /api/report/pdf/<upload_id>",
            "GET  /api/forecast/<upload_id>",
            "GET  /api/posts/<upload_id>",
            "GET  /api/posts/<upload_id>/top",
            "GET  /api/posts/<upload_id>/anomalies",
            "GET  /api/posts/<upload_id>/heatmap",
            "POST /api/ai/insights",
            "GET  /api/ai/insights/<upload_id>",
            "POST /api/ai/report/html",
            "GET  /api/ai/report/html/<upload_id>",
            "GET  /api/ai/report/pdf/<upload_id>",
            "POST /api/ai/explain-post",
            "POST /api/ai/captions",
            "POST /api/ai/hashtags",
            "GET  /api/alerts/<upload_id>",
            "PUT  /api/alerts/<alert_id>/dismiss",
            "GET  /api/goals",
            "POST /api/goals",
            "PUT  /api/goals/<goal_id>",
            "DELETE /api/goals/<goal_id>",
            "GET  /api/compare/<upload_id_a>/<upload_id_b>",
        ],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/uploads
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/uploads", methods=["GET"])
@require_auth
def list_uploads():
    """Return uploads belonging to the current user."""
    uploads = Upload.query.filter_by(user_id=g.current_user_id).order_by(Upload.created_at.desc()).all()
    result = []
    for u in uploads:
        upload_dict = u.to_dict()
        # Attach analytics summary if available
        if u.analytics:
            a = u.analytics
            upload_dict["summary"] = {
                "platform": a.platform,
                "total_posts": a.total_posts,
                "avg_engagement_rate": a.avg_engagement_rate,
                "total_reach": a.total_reach,
                "follower_count": a.follower_count,
                "engagement_trend": a.engagement_trend,
                "date_range_start": a.date_range_start.isoformat() if a.date_range_start else None,
                "date_range_end": a.date_range_end.isoformat() if a.date_range_end else None,
            }
        else:
            upload_dict["summary"] = None
        result.append(upload_dict)
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/analytics/<upload_id>
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/analytics/<upload_id>", methods=["GET"])
@require_auth
def get_analytics(upload_id: str):
    """Return full analytics for an upload with all JSON blobs parsed."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404
    if upload.user_id and upload.user_id != g.current_user_id:
        return jsonify({"error": "Access denied"}), 403

    if upload.status == "processing":
        return jsonify({"error": "Analytics still processing", "status": "processing"}), 202

    if upload.status == "error":
        return jsonify({"error": "Upload processing failed", "detail": upload.error_msg, "status": "error"}), 422

    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    if analytics is None:
        return jsonify({"error": "Analytics record not found"}), 404

    analytics_dict = analytics.to_dict()

    # Attach upload metadata
    analytics_dict["upload"] = upload.to_dict()

    # Attach post lists: top 10, worst 5, anomalies
    all_posts = Post.query.filter_by(upload_id=upload_id).all()
    posts_dicts = [p.to_dict() for p in all_posts]
    posts_sorted = sorted(posts_dicts, key=lambda p: p.get("engagement_rate", 0), reverse=True)

    analytics_dict["top_posts"] = posts_sorted[:10]
    analytics_dict["worst_posts"] = posts_sorted[-5:][::-1] if len(posts_sorted) >= 5 else posts_sorted[::-1]
    analytics_dict["anomaly_posts"] = [p for p in posts_dicts if p.get("is_anomaly")]

    return jsonify(analytics_dict), 200


# ---------------------------------------------------------------------------
# GET /api/uploads/group/<file_group_id>
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/uploads/group/<file_group_id>", methods=["GET"])
@require_auth
def get_upload_group(file_group_id: str):
    """Return all uploads that share a file_group_id (multi-platform splits)."""
    uploads = Upload.query.filter_by(file_group_id=file_group_id).all()
    result = []
    for u in uploads:
        d = u.to_dict()
        if u.analytics:
            a = u.analytics
            d["summary"] = {
                "platform": a.platform,
                "total_posts": a.total_posts,
                "avg_engagement_rate": a.avg_engagement_rate,
                "total_reach": a.total_reach,
                "follower_count": a.follower_count,
                "engagement_trend": a.engagement_trend,
                "date_range_start": a.date_range_start.isoformat() if a.date_range_start else None,
                "date_range_end": a.date_range_end.isoformat() if a.date_range_end else None,
            }
        result.append(d)
    return jsonify({"file_group_id": file_group_id, "uploads": result}), 200


# ---------------------------------------------------------------------------
# DELETE /api/uploads/<upload_id>
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/uploads/<upload_id>", methods=["DELETE"])
@require_auth
def delete_upload(upload_id: str):
    """Delete an upload and all cascade records."""
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404

    # Optionally delete the file from disk
    import os
    try:
        if upload.file_path and os.path.exists(upload.file_path):
            os.remove(upload.file_path)
    except OSError as e:
        current_app.logger.warning(f"Could not delete file {upload.file_path}: {e}")

    db.session.delete(upload)
    db.session.commit()
    return jsonify({"message": "Upload deleted successfully", "upload_id": upload_id}), 200


# ---------------------------------------------------------------------------
# GET /api/forecast/<upload_id>
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/forecast/<upload_id>", methods=["GET"])
@require_auth
def get_forecast(upload_id: str):
    """
    Return forecast data. If already computed, return cached version.
    Otherwise recompute from weekly_trend.
    """
    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    if analytics is None:
        return jsonify({"error": "Analytics not found for this upload"}), 404

    forecast_data = _parse_json_field(analytics.forecast_data, {})

    # If we have a cached non-empty forecast, return it
    if forecast_data and ("reach" in forecast_data or "engagement_rate" in forecast_data):
        return jsonify(forecast_data), 200

    # Recompute from stored weekly_trend
    weekly_trend = _parse_json_field(analytics.weekly_trend, [])
    analytics_stub = {"weekly_trend": weekly_trend}

    try:
        forecast_data = forecast_all(analytics_stub)
    except Exception as e:
        return jsonify({"error": f"Forecast computation failed: {e}"}), 500

    # Cache it
    import json as _json
    analytics.forecast_data = _json.dumps(forecast_data)
    db.session.commit()

    return jsonify(forecast_data), 200


# ---------------------------------------------------------------------------
# GET /api/report/pdf/<upload_id>
# ---------------------------------------------------------------------------

@analytics_bp.route("/api/report/pdf/<upload_id>", methods=["GET"])
@require_auth
def download_analytics_pdf(upload_id: str):
    """
    Generate and return a clean multi-page analytics PDF report using ReportLab.
    No AI required — purely data-driven.
    """
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404

    analytics = Analytics.query.filter_by(upload_id=upload_id).first()
    if analytics is None:
        return jsonify({"error": "Analytics not found"}), 404

    all_posts = Post.query.filter_by(upload_id=upload_id).order_by(Post.engagement_rate.desc()).limit(20).all()

    try:
        pdf_bytes = _build_analytics_pdf(upload, analytics, all_posts)
    except Exception as e:
        current_app.logger.error(f"PDF generation error: {e}")
        return jsonify({"error": f"PDF generation failed: {e}"}), 500

    filename = f"analytics-{upload.platform}-{upload_id[:8]}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


def _build_analytics_pdf(upload, analytics, posts) -> bytes:
    """Build a detailed analytics PDF report using ReportLab Platypus."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

    buf = BytesIO()

    # ── Color palette ──────────────────────────────────────────────────────
    TEAL     = colors.HexColor("#0C5752")
    FOREST   = colors.HexColor("#122620")
    GOLD     = colors.HexColor("#CFC292")
    GOLD_DK  = colors.HexColor("#B8A876")
    CANVAS   = colors.HexColor("#FEFDFB")
    MINT     = colors.HexColor("#34D399")
    RED      = colors.HexColor("#EF4444")
    LIGHT_BG = colors.HexColor("#F4EBD0")
    BORDER   = colors.HexColor("#1A2C28")  # ~20% opacity forest
    WHITE    = colors.white
    GRAY     = colors.HexColor("#64748B")
    LGRAY    = colors.HexColor("#E2E8F0")

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Analytics Report — {upload.platform}",
        author="SocialPulse",
    )

    styles = getSampleStyleSheet()

    def style(name, parent="Normal", **kw):
        return ParagraphStyle(name, parent=styles[parent], **kw)

    s_title   = style("s_title",   fontSize=22, textColor=FOREST, leading=28, fontName="Helvetica-Bold")
    s_sub     = style("s_sub",     fontSize=11, textColor=GRAY, leading=16)
    s_section = style("s_section", fontSize=13, textColor=TEAL, leading=18, fontName="Helvetica-Bold", spaceAfter=4)
    s_label   = style("s_label",   fontSize=8,  textColor=GRAY, leading=12, fontName="Helvetica", spaceAfter=2)
    s_value   = style("s_value",   fontSize=18, textColor=FOREST, leading=24, fontName="Helvetica-Bold")
    s_body    = style("s_body",    fontSize=9,  textColor=FOREST, leading=14)
    s_th      = style("s_th",      fontSize=8,  textColor=WHITE, leading=12, fontName="Helvetica-Bold", alignment=TA_CENTER)
    s_td      = style("s_td",      fontSize=8,  textColor=FOREST, leading=12, alignment=TA_CENTER)
    s_td_l    = style("s_td_l",    fontSize=8,  textColor=FOREST, leading=12, alignment=TA_LEFT)
    s_footer  = style("s_footer",  fontSize=7,  textColor=GRAY, leading=10, alignment=TA_CENTER)

    def fmt_n(n):
        if n is None or (isinstance(n, float) and n != n):
            return "—"
        v = float(n)
        if v >= 1_000_000: return f"{v/1_000_000:.1f}M"
        if v >= 1_000:     return f"{v/1_000:.1f}K"
        return f"{v:,.0f}"

    def fmt_pct(n, dec=2):
        if n is None: return "—"
        return f"{float(n):.{dec}f}%"

    def fmt_date(d):
        if d is None: return "—"
        if isinstance(d, str):
            try: d = datetime.fromisoformat(d)
            except: return d
        return d.strftime("%b %d, %Y")

    platform    = (analytics.platform or upload.platform or "").title()
    date_start  = fmt_date(analytics.date_range_start)
    date_end    = fmt_date(analytics.date_range_end)
    generated   = datetime.now().strftime("%B %d, %Y %H:%M")

    weekly_trend = _parse_json_field(analytics.weekly_trend, [])
    post_types   = _parse_json_field(analytics.post_type_breakdown, {})
    top_hashtags = _parse_json_field(analytics.top_hashtags, [])

    story = []

    # ── COVER / HEADER ─────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(f"Analytics Report", s_title))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"{platform} &nbsp;·&nbsp; {date_start} – {date_end}", s_sub))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(f"Generated {generated} &nbsp;·&nbsp; {fmt_n(analytics.total_posts)} posts analysed", s_sub))
    story.append(HRFlowable(width="100%", thickness=1, color=TEAL, spaceAfter=16))

    # ── KPI GRID ───────────────────────────────────────────────────────────
    story.append(Paragraph("Performance Overview", s_section))

    total_eng = (
        (analytics.total_likes or 0) +
        (analytics.total_comments or 0) +
        (analytics.total_shares or 0) +
        (analytics.total_saves or 0)
    )

    kpis = [
        ("Views (Impressions)",   fmt_n(analytics.total_impressions or analytics.total_reach)),
        ("Total Reach",           fmt_n(analytics.total_reach)),
        ("Followers",             fmt_n(analytics.follower_count)),
        ("Followers Gained",      fmt_n(analytics.follower_growth)),
        ("Avg Engagement Rate",   fmt_pct(analytics.avg_engagement_rate)),
        ("Total Interactions",    fmt_n(total_eng)),
        ("Total Likes",           fmt_n(analytics.total_likes)),
        ("Total Comments",        fmt_n(analytics.total_comments)),
        ("Total Shares",          fmt_n(analytics.total_shares)),
        ("Total Saves",           fmt_n(analytics.total_saves)),
        ("Virality Rate",         fmt_pct(analytics.virality_rate)),
        ("Save Rate",             fmt_pct(analytics.save_rate)),
    ]

    # 4-column KPI table
    kpi_rows = []
    for i in range(0, len(kpis), 4):
        chunk = kpis[i:i+4]
        while len(chunk) < 4:
            chunk.append(("", ""))
        label_row = [Paragraph(k[0], s_label) for k in chunk]
        value_row = [Paragraph(k[1], s_value) for k in chunk]
        kpi_rows.append(label_row)
        kpi_rows.append(value_row)
        kpi_rows.append([Spacer(1, 3 * mm)] * 4)

    kpi_table = Table(kpi_rows, colWidths=[4.5 * cm] * 4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX",        (0, 0), (-1, -1), 0.5, LGRAY),
        ("INNERGRID",  (0, 0), (-1, -1), 0.3, LGRAY),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── ENGAGEMENT STATS ──────────────────────────────────────────────────
    story.append(Paragraph("Engagement Statistics", s_section))
    eng_data = [
        [Paragraph("Metric", s_th), Paragraph("Value", s_th), Paragraph("Benchmark", s_th)],
        [Paragraph("Average ER",  s_td_l), Paragraph(fmt_pct(analytics.avg_engagement_rate),  s_td), Paragraph("Good: >2%",  s_td)],
        [Paragraph("Median ER",   s_td_l), Paragraph(fmt_pct(analytics.median_engagement_rate), s_td), Paragraph("—",         s_td)],
        [Paragraph("P90 ER",      s_td_l), Paragraph(fmt_pct(analytics.er_p90),               s_td), Paragraph("Top 10%",   s_td)],
        [Paragraph("Std Dev",     s_td_l), Paragraph(fmt_pct(analytics.er_std),               s_td), Paragraph("—",         s_td)],
        [Paragraph("ER Trend",    s_td_l), Paragraph((analytics.engagement_trend or "—").upper(), s_td), Paragraph("—",    s_td)],
        [Paragraph("Reach Growth",s_td_l), Paragraph(fmt_pct(analytics.reach_growth_rate),    s_td), Paragraph(">5% good", s_td)],
        [Paragraph("Post Freq",   s_td_l), Paragraph(f"{(analytics.posting_frequency or 0):.1f}/wk", s_td), Paragraph("3–7/wk",   s_td)],
        [Paragraph("Best Day",    s_td_l), Paragraph(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][analytics.best_posting_day or 0], s_td), Paragraph("—", s_td)],
        [Paragraph("Best Hour",   s_td_l), Paragraph(f"{analytics.best_posting_hour or 0}:00", s_td), Paragraph("—",        s_td)],
        [Paragraph("Top Format",  s_td_l), Paragraph(analytics.top_post_type or "—",          s_td), Paragraph("—",         s_td)],
    ]
    eng_table = Table(eng_data, colWidths=[6 * cm, 4 * cm, 8.2 * cm])
    eng_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
        ("BOX",      (0, 0), (-1, -1), 0.5, TEAL),
        ("INNERGRID",(0, 0), (-1, -1), 0.3, LGRAY),
        ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(eng_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── WEEKLY TREND TABLE ────────────────────────────────────────────────
    if weekly_trend:
        story.append(Paragraph("Weekly Trend", s_section))
        wt_header = [
            Paragraph("Week",       s_th),
            Paragraph("Posts",      s_th),
            Paragraph("Avg ER",     s_th),
            Paragraph("Total Reach",s_th),
            Paragraph("Total Likes",s_th),
        ]
        wt_rows = [wt_header]
        for w in weekly_trend[-12:]:  # last 12 weeks
            wt_rows.append([
                Paragraph(str(w.get("week", "—")),          s_td),
                Paragraph(fmt_n(w.get("posts")),             s_td),
                Paragraph(fmt_pct(w.get("avg_er")),          s_td),
                Paragraph(fmt_n(w.get("total_reach")),       s_td),
                Paragraph(fmt_n(w.get("total_likes")),       s_td),
            ])
        wt_table = Table(wt_rows, colWidths=[3.8 * cm, 2.5 * cm, 3 * cm, 4 * cm, 4 * cm])
        wt_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("BOX",      (0, 0), (-1, -1), 0.5, TEAL),
            ("INNERGRID",(0, 0), (-1, -1), 0.3, LGRAY),
            ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        story.append(wt_table)
        story.append(Spacer(1, 0.5 * cm))

    # ── POST TYPE BREAKDOWN ───────────────────────────────────────────────
    if post_types:
        story.append(Paragraph("Content Mix by Post Type", s_section))
        pt_header = [
            Paragraph("Type",       s_th),
            Paragraph("Posts",      s_th),
            Paragraph("% of Mix",   s_th),
            Paragraph("Avg ER",     s_th),
            Paragraph("Avg Reach",  s_th),
        ]
        pt_rows = [pt_header]
        for ptype, stats in sorted(post_types.items(), key=lambda x: x[1].get("avg_er", 0), reverse=True):
            pt_rows.append([
                Paragraph(ptype.title(), s_td_l),
                Paragraph(str(stats.get("count", 0)), s_td),
                Paragraph(fmt_pct(stats.get("pct")), s_td),
                Paragraph(fmt_pct(stats.get("avg_er")), s_td),
                Paragraph(fmt_n(stats.get("avg_reach")), s_td),
            ])
        pt_table = Table(pt_rows, colWidths=[4 * cm, 2.5 * cm, 3 * cm, 3 * cm, 4.7 * cm])
        pt_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("BOX",      (0, 0), (-1, -1), 0.5, TEAL),
            ("INNERGRID",(0, 0), (-1, -1), 0.3, LGRAY),
            ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        story.append(pt_table)
        story.append(Spacer(1, 0.5 * cm))

    # ── TOP POSTS ─────────────────────────────────────────────────────────
    if posts:
        story.append(Paragraph("Top 20 Posts by Engagement Rate", s_section))
        tp_header = [
            Paragraph("#",        s_th),
            Paragraph("Post ID",  s_th),
            Paragraph("Type",     s_th),
            Paragraph("Date",     s_th),
            Paragraph("Likes",    s_th),
            Paragraph("Comments", s_th),
            Paragraph("Reach",    s_th),
            Paragraph("ER %",     s_th),
        ]
        tp_rows = [tp_header]
        for i, p in enumerate(posts[:20], 1):
            tp_rows.append([
                Paragraph(str(i), s_td),
                Paragraph((p.post_id or f"Post_{i}")[:16], s_td_l),
                Paragraph(p.post_type or "—", s_td),
                Paragraph(fmt_date(p.posted_at) if p.posted_at else "—", s_td),
                Paragraph(fmt_n(p.likes), s_td),
                Paragraph(fmt_n(p.comments), s_td),
                Paragraph(fmt_n(p.reach), s_td),
                Paragraph(fmt_pct(p.engagement_rate), s_td),
            ])
        tp_table = Table(tp_rows, colWidths=[0.8*cm, 3.5*cm, 2*cm, 2.5*cm, 1.8*cm, 2.2*cm, 2.2*cm, 2.2*cm])
        tp_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("BOX",      (0, 0), (-1, -1), 0.5, TEAL),
            ("INNERGRID",(0, 0), (-1, -1), 0.3, LGRAY),
            ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ]))
        story.append(tp_table)
        story.append(Spacer(1, 0.5 * cm))

    # ── HASHTAGS ──────────────────────────────────────────────────────────
    if top_hashtags:
        story.append(Paragraph("Top Hashtags", s_section))
        ht_header = [
            Paragraph("Hashtag", s_th),
            Paragraph("Count",   s_th),
            Paragraph("Avg ER",  s_th),
        ]
        ht_rows = [ht_header]
        for h in top_hashtags[:15]:
            ht_rows.append([
                Paragraph(str(h.get("tag", "—")), s_td_l),
                Paragraph(str(h.get("count", 0)), s_td),
                Paragraph(fmt_pct(h.get("avg_er")), s_td),
            ])
        ht_table = Table(ht_rows, colWidths=[8 * cm, 4 * cm, 5.2 * cm])
        ht_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("BOX",      (0, 0), (-1, -1), 0.5, TEAL),
            ("INNERGRID",(0, 0), (-1, -1), 0.3, LGRAY),
            ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        story.append(ht_table)
        story.append(Spacer(1, 0.5 * cm))

    # ── FOOTER ────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD_DK, spaceBefore=8))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        f"SocialPulse Analytics · {platform} Report · Generated {generated} · Confidential",
        s_footer,
    ))

    doc.build(story)
    return buf.getvalue()
