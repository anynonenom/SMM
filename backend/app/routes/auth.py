"""
Auth routes — register, login, logout, me.

POST /api/auth/register   – create account
POST /api/auth/login      – get JWT (invalidates any previous session)
POST /api/auth/logout     – invalidate current session server-side
GET  /api/auth/me         – return current user info
"""

from __future__ import annotations

import bcrypt
from flask import Blueprint, g, jsonify, request

from .. import db, limiter
from ..models import User
from ..utils.auth import create_token, require_auth
from datetime import datetime, timezone

auth_bp = Blueprint("auth", __name__)


# ---------------------------------------------------------------------------
# Register  —  5 attempts / minute per IP
# ---------------------------------------------------------------------------

@auth_bp.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute; 20 per hour")
def register():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    name     = (data.get("name") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email address"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = User(
        email=email,
        password_hash=pw_hash,
        name=name or None,
        token_version=0,
        last_login_at=datetime.now(timezone.utc),
    )
    db.session.add(user)
    db.session.commit()

    token = create_token(user.id, user.token_version)
    return jsonify({"token": token, "user": user.to_dict()}), 201


# ---------------------------------------------------------------------------
# Login  —  10 attempts / minute per IP (brute-force protection)
# ---------------------------------------------------------------------------

@auth_bp.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute; 50 per hour")
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    # Use constant-time comparison even on missing user to prevent timing attacks
    dummy_hash = "$2b$12$invalidhashfortimingprotection000000000000000000000000000"
    check_hash = user.password_hash if user else dummy_hash
    password_ok = bcrypt.checkpw(password.encode(), check_hash.encode())

    if not user or not password_ok:
        return jsonify({"error": "Invalid email or password"}), 401

    # Increment version → all previous tokens immediately become invalid
    user.token_version = (user.token_version or 0) + 1
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    token = create_token(user.id, user.token_version)
    return jsonify({"token": token, "user": user.to_dict()}), 200


# ---------------------------------------------------------------------------
# Logout  —  invalidates the current session server-side
# ---------------------------------------------------------------------------

@auth_bp.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    user = User.query.get(g.current_user_id)
    if user:
        user.token_version = (user.token_version or 0) + 1
        db.session.commit()
    return jsonify({"message": "Logged out successfully"}), 200


# ---------------------------------------------------------------------------
# Me (current user)
# ---------------------------------------------------------------------------

@auth_bp.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    user = User.query.get(g.current_user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200
