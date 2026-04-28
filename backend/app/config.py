"""
Application configuration loaded from environment variables / .env file.
"""

import os


class Config:
    # Security
    SECRET_KEY: str  = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
    JWT_SECRET:  str = os.environ.get("JWT_SECRET", os.environ.get("SECRET_KEY", "dev-jwt-secret-change-in-production"))

    # Database — Railway provides DATABASE_URL as postgresql://, SQLAlchemy needs postgresql+psycopg2://
    _db_url: str = os.environ.get("DATABASE_URL", "sqlite:///smm.db")
    SQLALCHEMY_DATABASE_URI: str = _db_url.replace("postgresql://", "postgresql+psycopg2://", 1) if _db_url.startswith("postgresql://") else _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # AI provider keys (any one is enough)
    OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
    AI_API_KEY: str = (
        os.environ.get("AI_API_KEY")
        or OPENROUTER_API_KEY
        or GEMINI_API_KEY
        or GROQ_API_KEY
        or ANTHROPIC_API_KEY
    )

    # CORS
    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:3000")

    # File uploads
    MAX_CONTENT_LENGTH: int = 50 * 1024 * 1024  # 50 MB
    UPLOAD_FOLDER: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

    # Flask environment
    FLASK_ENV: str = os.environ.get("FLASK_ENV", "development")
    DEBUG: bool = FLASK_ENV == "development"

    # AI model
    AI_MODEL: str = "anthropic/claude-sonnet-4-5"
    AI_MAX_TOKENS: int = 4000

    @classmethod
    def get_cors_origins(cls) -> list:
        """Return CORS_ORIGINS as a list."""
        raw = cls.CORS_ORIGINS
        return [o.strip() for o in raw.split(",") if o.strip()]
