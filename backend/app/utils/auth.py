"""
JWT auth helpers and require_auth decorator.

Token versioning: every token embeds the user's current token_version.
Login/logout increment this version, immediately invalidating all older tokens
(i.e. only one active session per user at any time).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request


def _secret() -> str:
    return current_app.config["JWT_SECRET"]


def create_token(user_id: str, version: int) -> str:
    payload = {
        "sub": user_id,
        "ver": version,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),   # 7-day sessions
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token: str) -> tuple[str, int]:
    """Return (user_id, version) from a valid token, or raise jwt exceptions."""
    payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    return payload["sub"], payload.get("ver", 0)


def require_auth(f):
    """
    Decorator — 401 if no valid Bearer token OR if token version is stale
    (user logged in elsewhere / logged out). Sets g.current_user_id.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401
        token = auth[7:]
        try:
            user_id, version = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired — please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid session — please log in again."}), 401

        # Validate token version against DB (single-session enforcement)
        from ..models import User
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "Account not found."}), 401
        if user.token_version != version:
            return jsonify({"error": "Session invalidated — please log in again."}), 401

        g.current_user_id = user_id
        return f(*args, **kwargs)
    return decorated
