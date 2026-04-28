"""
Flask application factory.
"""

import os
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv

load_dotenv()

# Initialise extensions (without binding to an app yet)
db = SQLAlchemy()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],          # no global limit — set per-route
    storage_uri="memory://",    # in-process store (fine for single-process gunicorn workers)
)


def _migrate_columns(app) -> None:
    """
    Safely add any missing columns to existing tables.
    Uses raw SQL ALTER TABLE … ADD COLUMN IF NOT EXISTS so it's idempotent.
    """
    from sqlalchemy import text
    migrations = [
        # uploads table
        "ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_group_id VARCHAR(36)",
        "ALTER TABLE uploads ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)",
        # analytics table
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS monthly_trend TEXT DEFAULT '[]'",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS yearly_trend  TEXT DEFAULT '[]'",
        # users table — session security
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
    ]
    with db.engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                app.logger.warning(f"Migration skipped ({e}): {sql}")
        conn.commit()


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__, instance_relative_config=False)

    # ------------------------------------------------------------------
    # Load configuration
    # ------------------------------------------------------------------
    from .config import Config
    app.config.from_object(Config)

    # Ensure the uploads directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # ------------------------------------------------------------------
    # Initialise extensions
    # ------------------------------------------------------------------
    db.init_app(app)
    limiter.init_app(app)

    # Return a clean 429 JSON response instead of HTML
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({"error": "Too many requests — please slow down and try again."}), 429

    cors_origins = Config.get_cors_origins()
    CORS(
        app,
        resources={r"/api/*": {"origins": cors_origins}},
        supports_credentials=True,
    )

    # ------------------------------------------------------------------
    # Register blueprints
    # ------------------------------------------------------------------
    from .routes.auth import auth_bp
    from .routes.upload import upload_bp
    from .routes.analytics import analytics_bp
    from .routes.posts import posts_bp
    from .routes.ai import ai_bp
    from .routes.alerts import alerts_bp
    from .routes.compare import compare_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(compare_bp)

    # ------------------------------------------------------------------
    # Create database tables + run column migrations
    # ------------------------------------------------------------------
    with app.app_context():
        from . import models  # noqa: F401 – ensure models are imported
        try:
            db.create_all()  # creates all tables if they don't exist
        except Exception as e:
            err_str = str(e)
            if "pg_type_typname_nsp_index" in err_str or "UniqueViolation" in err_str:
                # PostgreSQL orphaned type left behind by a previously failed CREATE TABLE.
                # Drop it and retry.
                from sqlalchemy import text
                with db.engine.connect() as conn:
                    conn.execute(text("DROP TYPE IF EXISTS users CASCADE"))
                    conn.execute(text("DROP TYPE IF EXISTS uploads CASCADE"))
                    conn.execute(text("DROP TYPE IF EXISTS analytics CASCADE"))
                    conn.execute(text("DROP TYPE IF EXISTS alerts CASCADE"))
                    conn.execute(text("DROP TYPE IF EXISTS goals CASCADE"))
                    conn.commit()
                db.create_all()
            else:
                raise
        _migrate_columns(app)

    # ------------------------------------------------------------------
    # Health check / root
    # ------------------------------------------------------------------

    @app.route("/")
    @app.route("/api/")
    def health():
        return {"status": "ok", "service": "SMM Analytics API", "version": "1.0.0"}

    # ------------------------------------------------------------------
    # Admin init route (force table creation)
    # ------------------------------------------------------------------
    @app.route("/api/init-db")
    def init_db():
        try:
            from . import models  # noqa: F401
            db.create_all()
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            db_url = app.config.get("SQLALCHEMY_DATABASE_URI", "")
            provider = "postgresql" if "postgresql" in db_url else "sqlite"
            # Show partial URL for debugging (hide password)
            import re
            safe_url = re.sub(r":([^@]+)@", ":***@", db_url)
            return {"status": "ok", "provider": provider, "tables": tables, "db_url": safe_url}
        except Exception as e:
            return {"status": "error", "error": str(e)}, 500

    return app
