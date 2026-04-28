-- EIDEN SMM Analytics — D1 Schema

CREATE TABLE IF NOT EXISTS uploads (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL,
  filename    TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  row_count   INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'done',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics (
  id                  TEXT PRIMARY KEY,
  upload_id           TEXT REFERENCES uploads(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  date_range_start    TEXT,
  date_range_end      TEXT,
  total_posts         INTEGER DEFAULT 0,
  avg_engagement_rate REAL DEFAULT 0,
  total_reach         INTEGER DEFAULT 0,
  total_impressions   INTEGER DEFAULT 0,
  total_likes         INTEGER DEFAULT 0,
  total_comments      INTEGER DEFAULT 0,
  total_shares        INTEGER DEFAULT 0,
  follower_count      INTEGER DEFAULT 0,
  follower_growth     INTEGER DEFAULT 0,
  weekly_trend        TEXT,   -- JSON blob
  posting_times       TEXT,   -- JSON blob
  post_type_breakdown TEXT,   -- JSON blob
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  upload_id       TEXT REFERENCES uploads(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  post_id         TEXT,
  posted_at       TEXT,
  post_type       TEXT DEFAULT 'Post',
  caption         TEXT DEFAULT '',
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  saves           INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id           TEXT PRIMARY KEY,
  upload_id    TEXT REFERENCES uploads(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL DEFAULT 'full_analysis',
  content      TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id          TEXT PRIMARY KEY,
  upload_id   TEXT REFERENCES uploads(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL DEFAULT 'anomaly',
  severity    TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  metric      TEXT,
  value       REAL,
  baseline    REAL,
  post_id     TEXT,
  dismissed   INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  metric     TEXT NOT NULL,
  target     REAL NOT NULL,
  current    REAL DEFAULT 0,
  deadline   TEXT,
  platform   TEXT DEFAULT 'all',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_upload ON posts(upload_id);
CREATE INDEX IF NOT EXISTS idx_analytics_upload ON analytics(upload_id);
CREATE INDEX IF NOT EXISTS idx_insights_upload ON ai_insights(upload_id);
CREATE INDEX IF NOT EXISTS idx_alerts_upload ON alerts(upload_id);
CREATE INDEX IF NOT EXISTS idx_uploads_created ON uploads(created_at DESC);
