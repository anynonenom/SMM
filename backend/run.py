"""
Entry point for the SMM Analytics Platform Flask application.
Run with: python run.py
Production: gunicorn -w 4 -b 0.0.0.0:5001 run:app
"""

import os
from dotenv import load_dotenv

load_dotenv()

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV", "development") == "development"
    print(f"[SMM Backend] Starting on http://0.0.0.0:{port}  (debug={debug})")
    app.run(host="0.0.0.0", port=port, debug=debug)
