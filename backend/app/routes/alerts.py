"""
Alerts and Goals routes.
"""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, request

from .. import db
from ..utils.auth import require_auth
from ..models import Alert, Goal, Upload

alerts_bp = Blueprint("alerts", __name__)

_SEVERITY_ORDER = {"critical": 0, "warning": 1, "good": 2, "info": 3}


def _parse_deadline(val) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        from dateutil import parser as du_parser
        return du_parser.parse(str(val))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# GET /api/alerts/<upload_id>
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/alerts/<upload_id>", methods=["GET"])
@require_auth
def get_alerts(upload_id: str):
    """
    Return all alerts for an upload, sorted by severity.
    Query params:
        dismissed=true|false  (default: returns all)
        type=anomaly|threshold|trend|milestone
    """
    upload = Upload.query.get(upload_id)
    if upload is None:
        return jsonify({"error": "Upload not found"}), 404

    query = Alert.query.filter_by(upload_id=upload_id)

    dismissed_param = request.args.get("dismissed", "").lower()
    if dismissed_param == "false":
        query = query.filter(Alert.dismissed.is_(False))
    elif dismissed_param == "true":
        query = query.filter(Alert.dismissed.is_(True))

    alert_type_param = request.args.get("type", "").strip()
    if alert_type_param:
        query = query.filter(Alert.alert_type == alert_type_param)

    alerts = query.all()
    alerts_dicts = [a.to_dict() for a in alerts]

    # Sort by severity
    alerts_dicts.sort(key=lambda a: (_SEVERITY_ORDER.get(a.get("severity", "info"), 4),
                                     a.get("created_at", "")))

    # Summarise counts by severity
    counts = {}
    for a in alerts_dicts:
        sev = a.get("severity", "info")
        counts[sev] = counts.get(sev, 0) + 1

    return jsonify({
        "upload_id": upload_id,
        "total": len(alerts_dicts),
        "severity_counts": counts,
        "alerts": alerts_dicts,
    }), 200


# ---------------------------------------------------------------------------
# PUT /api/alerts/<alert_id>/dismiss
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/alerts/<alert_id>/dismiss", methods=["PUT"])
@require_auth
def dismiss_alert(alert_id: str):
    """Mark an alert as dismissed."""
    alert = Alert.query.get(alert_id)
    if alert is None:
        return jsonify({"error": "Alert not found"}), 404

    body = request.get_json(silent=True) or {}
    alert.dismissed = body.get("dismissed", True)
    db.session.commit()

    return jsonify({
        "alert_id": alert_id,
        "dismissed": alert.dismissed,
        "message": "Alert updated",
    }), 200


# ---------------------------------------------------------------------------
# GET /api/goals
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/goals", methods=["GET"])
@require_auth
def list_goals():
    """Return all goals, optionally filtered by platform."""
    platform = request.args.get("platform", "").strip()
    query = Goal.query
    if platform:
        query = query.filter(Goal.platform.ilike(f"%{platform}%"))
    goals = query.order_by(Goal.created_at.desc()).all()
    return jsonify({"goals": [g.to_dict() for g in goals]}), 200


# ---------------------------------------------------------------------------
# POST /api/goals
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/goals", methods=["POST"])
@require_auth
def create_goal():
    """
    Create a new goal.
    Body: {name, metric, target, current?, deadline?, platform?}
    """
    body = request.get_json(silent=True) or {}

    name = body.get("name", "").strip()
    metric = body.get("metric", "").strip()
    target = body.get("target")

    if not name:
        return jsonify({"error": "name is required"}), 400
    if not metric:
        return jsonify({"error": "metric is required"}), 400
    if target is None:
        return jsonify({"error": "target is required"}), 400

    try:
        target_float = float(target)
    except (ValueError, TypeError):
        return jsonify({"error": "target must be a number"}), 400

    try:
        current_val = float(body.get("current", 0))
    except (ValueError, TypeError):
        current_val = 0.0

    goal = Goal(
        name=name,
        metric=metric,
        target=target_float,
        current=current_val,
        deadline=_parse_deadline(body.get("deadline")),
        platform=body.get("platform", "").strip() or None,
    )
    db.session.add(goal)
    db.session.commit()

    return jsonify(goal.to_dict()), 201


# ---------------------------------------------------------------------------
# PUT /api/goals/<goal_id>
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/goals/<goal_id>", methods=["PUT"])
@require_auth
def update_goal(goal_id: str):
    """
    Update goal fields.
    Body: {current?, target?, name?, deadline?, platform?}
    """
    goal = Goal.query.get(goal_id)
    if goal is None:
        return jsonify({"error": "Goal not found"}), 404

    body = request.get_json(silent=True) or {}

    if "current" in body:
        try:
            goal.current = float(body["current"])
        except (ValueError, TypeError):
            return jsonify({"error": "current must be a number"}), 400

    if "target" in body:
        try:
            goal.target = float(body["target"])
        except (ValueError, TypeError):
            return jsonify({"error": "target must be a number"}), 400

    if "name" in body:
        goal.name = str(body["name"]).strip()

    if "metric" in body:
        goal.metric = str(body["metric"]).strip()

    if "platform" in body:
        goal.platform = str(body["platform"]).strip() or None

    if "deadline" in body:
        goal.deadline = _parse_deadline(body["deadline"])

    goal.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify(goal.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/goals/<goal_id>
# ---------------------------------------------------------------------------

@alerts_bp.route("/api/goals/<goal_id>", methods=["DELETE"])
@require_auth
def delete_goal(goal_id: str):
    """Delete a goal."""
    goal = Goal.query.get(goal_id)
    if goal is None:
        return jsonify({"error": "Goal not found"}), 404

    db.session.delete(goal)
    db.session.commit()

    return jsonify({"message": "Goal deleted", "goal_id": goal_id}), 200
