"""
Multi-platform CSV parser for the SMM Analytics Platform.

Handles platform detection, column normalisation, and type coercion so that
all downstream analytics always receive a unified DataFrame schema.
"""

import re
import io
import chardet
import pandas as pd
import numpy as np
from typing import Tuple


# ---------------------------------------------------------------------------
# Platform column signatures
# Each entry is a list of *hints* – if enough of these appear in the CSV's
# column names (after lowercasing + stripping) we label it that platform.
# ---------------------------------------------------------------------------

PLATFORM_SIGNATURES: dict = {
    "instagram": [
        "impressions", "reach", "saves", "story_exits", "story_replies",
        "profile_visits", "accounts_reached", "accounts_engaged", "reel_plays",
        "carousel", "post_type", "ig_", "instagram",
    ],
    "tiktok": [
        "video_views", "tiktok", "duets", "stitches", "average_watch_time",
        "video_completion_rate", "profile_visits", "new_followers",
        "total_play_time", "watched_full_video",
    ],
    "youtube": [
        "youtube", "views", "watch_time", "subscribers", "average_view_duration",
        "click_through_rate", "revenue", "cards", "end_screens",
        "impressions_click_through_rate",
    ],
    "linkedin": [
        "linkedin", "impressions", "unique_impressions", "clicks",
        "ctr", "social_actions", "company_page", "follower_count",
        "organic_reach", "paid_reach", "engagement_rate",
    ],
    "twitter": [
        "twitter", "tweet", "retweets", "quotes", "detail_expands",
        "url_clicks", "user_profile_clicks", "media_views", "media_engagements",
    ],
    "facebook": [
        "facebook", "page_likes", "post_reach", "post_impressions",
        "reactions", "post_clicks", "negative_feedback", "video_views_10s",
        "organic_reach", "paid_reach",
    ],
}

# ---------------------------------------------------------------------------
# Unified column schema
# ---------------------------------------------------------------------------

UNIFIED_COLUMNS = [
    "date", "post_id", "post_type", "caption",
    "likes", "comments", "shares", "saves",
    "reach", "impressions", "followers",
    "engagement_rate",
    "video_views", "video_completion_rate",
    "story_exits", "story_replies",
    "hashtags",
]

# ---------------------------------------------------------------------------
# Column name mapping: {platform: {unified_name: [possible_source_names]}}
# Order matters – first match wins.
# ---------------------------------------------------------------------------

COLUMN_MAP: dict = {
    "instagram": {
        "date": ["date", "publish_time", "timestamp", "post_date", "created_time"],
        "post_id": ["post_id", "id", "media_id", "permalink"],
        "post_type": ["post_type", "media_type", "type", "content_type"],
        "caption": ["caption", "description", "post_caption", "text"],
        "likes": ["likes", "like_count", "likes_count", "heart_count"],
        "comments": ["comments", "comment_count", "comments_count"],
        "shares": ["shares", "share_count", "shares_count"],
        "saves": ["saves", "save_count", "saved", "bookmarks"],
        "reach": ["reach", "accounts_reached", "unique_reach"],
        "impressions": ["impressions", "total_impressions"],
        "followers": ["followers", "follower_count", "followers_count", "total_followers"],
        "engagement_rate": ["engagement_rate", "er", "engagement"],
        "video_views": ["video_views", "reel_plays", "views"],
        "video_completion_rate": ["video_completion_rate", "completion_rate"],
        "story_exits": ["story_exits", "exits", "swipe_aways"],
        "story_replies": ["story_replies", "replies"],
        "hashtags": ["hashtags", "tags"],
    },
    "tiktok": {
        "date": ["date", "create_time", "publish_time", "timestamp"],
        "post_id": ["video_id", "post_id", "id"],
        "post_type": ["post_type", "type", "video_type"],
        "caption": ["caption", "description", "video_description", "title"],
        "likes": ["likes", "digg_count", "like_count", "heart_count"],
        "comments": ["comments", "comment_count"],
        "shares": ["shares", "share_count"],
        "saves": ["saves", "collect_count", "bookmarks"],
        "reach": ["reach", "accounts_reached"],
        "impressions": ["impressions", "total_play_time", "views"],
        "followers": ["followers", "follower_count", "new_followers"],
        "engagement_rate": ["engagement_rate", "er"],
        "video_views": ["video_views", "views", "play_count"],
        "video_completion_rate": ["video_completion_rate", "completion_rate", "watched_full_video"],
        "story_exits": [],
        "story_replies": [],
        "hashtags": ["hashtags", "tags"],
    },
    "youtube": {
        "date": ["date", "publish_date", "published_at"],
        "post_id": ["video_id", "id", "post_id"],
        "post_type": ["post_type", "type", "video_type"],
        "caption": ["title", "caption", "description"],
        "likes": ["likes", "like_count", "thumbs_up"],
        "comments": ["comments", "comment_count"],
        "shares": ["shares", "share_count"],
        "saves": ["saves", "add_to_playlist"],
        "reach": ["reach", "unique_viewers", "estimated_unique_viewers"],
        "impressions": ["impressions"],
        "followers": ["subscribers", "subscriber_count", "followers"],
        "engagement_rate": ["engagement_rate", "er"],
        "video_views": ["views", "video_views", "view_count"],
        "video_completion_rate": ["average_view_percentage", "video_completion_rate", "completion_rate"],
        "story_exits": [],
        "story_replies": [],
        "hashtags": ["hashtags", "tags"],
    },
    "linkedin": {
        "date": ["date", "post_date", "published_at", "created_at"],
        "post_id": ["post_id", "activity_id", "id"],
        "post_type": ["content_type", "post_type", "type"],
        "caption": ["text", "caption", "post_text", "description"],
        "likes": ["likes", "reactions", "like_count"],
        "comments": ["comments", "comment_count"],
        "shares": ["shares", "reposts", "share_count"],
        "saves": ["saves", "bookmarks"],
        "reach": ["reach", "organic_reach", "unique_impressions"],
        "impressions": ["impressions", "total_impressions"],
        "followers": ["followers", "follower_count", "page_followers"],
        "engagement_rate": ["engagement_rate", "er", "ctr"],
        "video_views": ["video_views", "views"],
        "video_completion_rate": ["video_completion_rate"],
        "story_exits": [],
        "story_replies": [],
        "hashtags": ["hashtags", "tags"],
    },
    "twitter": {
        "date": ["date", "time", "created_at", "tweet_date"],
        "post_id": ["tweet_id", "id_str", "id", "post_id"],
        "post_type": ["tweet_type", "type", "post_type"],
        "caption": ["tweet_text", "text", "caption", "full_text"],
        "likes": ["likes", "favorites", "favorite_count", "like_count"],
        "comments": ["replies", "reply_count", "comments"],
        "shares": ["retweets", "retweet_count", "shares"],
        "saves": ["bookmarks", "saves", "bookmark_count"],
        "reach": ["reach", "impressions", "potential_reach"],
        "impressions": ["impressions", "total_impressions"],
        "followers": ["followers", "follower_count", "followers_count"],
        "engagement_rate": ["engagement_rate", "engagements", "er"],
        "video_views": ["video_views", "media_views"],
        "video_completion_rate": [],
        "story_exits": [],
        "story_replies": [],
        "hashtags": ["hashtags"],
    },
    "facebook": {
        "date": ["date", "publish_time", "created_time", "post_date"],
        "post_id": ["post_id", "id", "status_id"],
        "post_type": ["type", "post_type", "content_type"],
        "caption": ["message", "caption", "description", "story"],
        "likes": ["likes", "reactions", "like_count"],
        "comments": ["comments", "comment_count"],
        "shares": ["shares", "share_count"],
        "saves": ["saves"],
        "reach": ["reach", "post_reach", "organic_reach"],
        "impressions": ["impressions", "post_impressions", "total_impressions"],
        "followers": ["page_likes", "followers", "fan_count"],
        "engagement_rate": ["engagement_rate", "er"],
        "video_views": ["video_views", "total_video_views"],
        "video_completion_rate": ["video_avg_time_watched", "video_completion_rate"],
        "story_exits": [],
        "story_replies": [],
        "hashtags": ["hashtags"],
    },
    "generic": {
        "date": ["date", "timestamp", "created_at", "time", "post_date"],
        "post_id": ["id", "post_id"],
        "post_type": ["type", "post_type", "content_type"],
        "caption": ["caption", "text", "description", "message", "title"],
        "likes": ["likes", "like_count"],
        "comments": ["comments", "comment_count"],
        "shares": ["shares", "share_count"],
        "saves": ["saves", "bookmarks"],
        "reach": ["reach"],
        "impressions": ["impressions"],
        "followers": ["followers", "follower_count"],
        "engagement_rate": ["engagement_rate", "er"],
        "video_views": ["video_views", "views"],
        "video_completion_rate": ["video_completion_rate"],
        "story_exits": ["story_exits"],
        "story_replies": ["story_replies"],
        "hashtags": ["hashtags"],
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_key(name: str) -> str:
    """Lowercase, strip spaces/underscores for fuzzy matching."""
    return re.sub(r"[\s_\-]+", "", name.lower())


def _fuzzy_find(target_keys: list, available_clean: dict) -> str | None:
    """Return the original column name that fuzzy-matches any of target_keys."""
    for key in target_keys:
        clean = _clean_key(key)
        if clean in available_clean:
            return available_clean[clean]
    return None


def detect_platform(df: pd.DataFrame) -> str:
    """
    Score each platform by counting how many of its signature hints appear
    in the DataFrame's column names. Return the platform with the highest
    score (minimum 2), or 'generic'.
    """
    col_names_lower = [_clean_key(c) for c in df.columns]
    col_set = set(col_names_lower)

    scores: dict[str, int] = {}
    for platform, hints in PLATFORM_SIGNATURES.items():
        score = 0
        for hint in hints:
            hint_clean = _clean_key(hint)
            # Partial match: hint appears as substring of any column name
            if any(hint_clean in col for col in col_set):
                score += 1
        scores[platform] = score

    best_platform = max(scores, key=lambda p: scores[p])
    if scores[best_platform] >= 2:
        return best_platform
    return "generic"


def normalize_columns(df: pd.DataFrame, platform: str) -> pd.DataFrame:
    """
    Map platform-specific column names to the unified schema.
    Missing columns are filled with 0 (or empty string for text cols).
    """
    mapping = COLUMN_MAP.get(platform, COLUMN_MAP["generic"])

    # Build reverse lookup: clean(original_col) -> original_col
    available_clean = {_clean_key(c): c for c in df.columns}

    rename_map: dict[str, str] = {}
    for unified_col, candidates in mapping.items():
        # Build full candidate list including the unified name itself
        all_candidates = [unified_col] + candidates
        found = _fuzzy_find(all_candidates, available_clean)
        if found and found not in rename_map.values():
            rename_map[found] = unified_col

    # Rename matched columns
    df = df.rename(columns=rename_map)

    # Add missing unified columns with defaults
    text_cols = {"caption", "post_type", "post_id", "hashtags"}
    for col in UNIFIED_COLUMNS:
        if col not in df.columns:
            df[col] = "" if col in text_cols else 0

    return df


def _parse_numeric(series: pd.Series) -> pd.Series:
    """
    Coerce a series to numeric, handling:
    - Strings with commas as thousand-separators: "1,234" -> 1234
    - Percentage strings: "12.3%" -> 12.3
    - Empty / null values -> 0
    """
    if series.dtype in [np.float64, np.int64, float, int]:
        return series.fillna(0)

    def _convert(val):
        if pd.isna(val) or val == "":
            return 0.0
        s = str(val).strip()
        s = s.replace(",", "").replace("%", "").replace("$", "").strip()
        try:
            return float(s)
        except ValueError:
            return 0.0

    return series.apply(_convert)


def _parse_dates(df: pd.DataFrame) -> pd.DataFrame:
    """Try to parse the 'date' column to datetime; keep original on failure."""
    if "date" not in df.columns:
        return df
    try:
        df["date"] = pd.to_datetime(df["date"], infer_format=False, utc=False, errors="coerce")
        # Fill any unparseable rows with NaT – they'll be handled downstream
    except Exception:
        pass
    return df


def _parse_hashtags(df: pd.DataFrame) -> pd.DataFrame:
    """
    If the hashtags column is a raw string or empty, extract hashtags from
    the caption column as a fallback.
    """
    def extract(row):
        # Prefer existing hashtags column
        h = row.get("hashtags", "")
        if isinstance(h, list) and h:
            return h
        if isinstance(h, str) and h.strip():
            tags = re.findall(r"#\w+", h)
            if tags:
                return [t.lower() for t in tags]
        # Fallback: extract from caption
        caption = row.get("caption", "")
        if isinstance(caption, str):
            return [t.lower() for t in re.findall(r"#\w+", caption)]
        return []

    df["hashtags"] = df.apply(extract, axis=1)
    return df


_PLATFORM_ALIASES: dict = {
    "instagram": "instagram", "ig": "instagram", "insta": "instagram",
    "facebook": "facebook", "fb": "facebook", "meta": "facebook",
    "tiktok": "tiktok", "tt": "tiktok", "tik tok": "tiktok",
    "linkedin": "linkedin", "li": "linkedin",
    "twitter": "twitter", "x": "twitter",
    "youtube": "youtube", "yt": "youtube",
}


def _normalize_platform_name(val: str) -> str:
    return _PLATFORM_ALIASES.get(val.lower().strip(), val.lower().strip())


def detect_platform_column(df: pd.DataFrame):
    """Return the column name that holds a platform/network identifier, or None."""
    for col in df.columns:
        if _clean_key(col) in ("platform", "network", "channel", "socialmedia", "social"):
            return col
    return None


def split_by_platform(filepath: str) -> dict:
    """
    Read a CSV that has a 'platform' column and return a dict of
    {platform_name: (normalised_df, platform_str)}.
    Falls back to normal single-platform parse if no platform column found.
    """
    # Parse raw file first (reuse the encoding/delimiter logic)
    with open(filepath, "rb") as fh:
        raw = fh.read()
    detected = chardet.detect(raw)
    encoding = detected.get("encoding") or "utf-8"
    if encoding.lower() in ("iso-8859-1", "latin-1", "windows-1252"):
        encoding = "latin-1"
    text = raw.decode(encoding, errors="replace").lstrip("\ufeff")

    sample = "\n".join(text.splitlines()[:5])
    delimiter = ","
    for sep in [",", ";", "\t", "|"]:
        counts = [line.count(sep) for line in sample.splitlines() if line.strip()]
        if counts and all(c == counts[0] and c > 0 for c in counts):
            delimiter = sep
            break

    df_raw = pd.read_csv(
        __import__("io").StringIO(text),
        sep=delimiter, engine="python", on_bad_lines="skip",
        dtype=str, keep_default_na=False,
    )
    df_raw = df_raw.dropna(how="all", axis=1).dropna(how="all", axis=0)
    df_raw.columns = [str(c).strip() for c in df_raw.columns]

    plat_col = detect_platform_column(df_raw)
    if plat_col is None:
        df, platform = parse_csv(filepath)
        return {platform: (df, platform)}

    result = {}
    for raw_val in df_raw[plat_col].unique():
        platform_name = _normalize_platform_name(str(raw_val))
        sub = df_raw[df_raw[plat_col] == raw_val].copy().drop(columns=[plat_col]).reset_index(drop=True)
        if sub.empty:
            continue
        detected_plat = detect_platform(sub)
        # Prefer the explicit label over auto-detection
        final_plat = platform_name if platform_name in PLATFORM_SIGNATURES else detected_plat
        sub = normalize_columns(sub, final_plat)
        numeric_cols = [
            "likes", "comments", "shares", "saves", "reach", "impressions",
            "followers", "engagement_rate", "video_views", "video_completion_rate",
            "story_exits", "story_replies",
        ]
        for col in numeric_cols:
            if col in sub.columns:
                sub[col] = _parse_numeric(sub[col])
        sub = _parse_dates(sub)
        sub = _parse_hashtags(sub)
        if sub["engagement_rate"].sum() == 0:
            total_interactions = sub["likes"] + sub["comments"] + sub["shares"] + sub["saves"]
            base = sub["reach"].replace(0, __import__("numpy").nan)
            sub["engagement_rate"] = (total_interactions / base * 100).fillna(0)
        if sub["date"].notna().any():
            sub = sub.sort_values("date", na_position="last").reset_index(drop=True)
        result[final_plat] = (sub, final_plat)

    return result if result else {("generic"): parse_csv(filepath)}


def parse_csv(filepath: str) -> Tuple[pd.DataFrame, str]:
    """
    Read a CSV file from *filepath*, detect its platform, normalise columns,
    parse dates and numerics, and return ``(df, platform)``.

    Handles:
    - Various text encodings (detected via chardet)
    - BOM markers
    - Various delimiters (, ; \\t |)
    - Commas / % in numeric fields
    - Inconsistent date formats
    """
    # ------------------------------------------------------------------
    # Detect encoding
    # ------------------------------------------------------------------
    with open(filepath, "rb") as fh:
        raw = fh.read()

    detected = chardet.detect(raw)
    encoding = detected.get("encoding") or "utf-8"
    # Treat latin-1/iso variants uniformly
    if encoding.lower() in ("iso-8859-1", "latin-1", "windows-1252"):
        encoding = "latin-1"

    text = raw.decode(encoding, errors="replace")

    # Strip UTF-8 BOM if present
    text = text.lstrip("\ufeff")

    # ------------------------------------------------------------------
    # Detect delimiter (try common ones)
    # ------------------------------------------------------------------
    sample = "\n".join(text.splitlines()[:5])
    delimiter = ","
    for sep in [",", ";", "\t", "|"]:
        counts = [line.count(sep) for line in sample.splitlines() if line.strip()]
        if counts and all(c == counts[0] and c > 0 for c in counts):
            delimiter = sep
            break

    df = pd.read_csv(
        io.StringIO(text),
        sep=delimiter,
        engine="python",
        on_bad_lines="skip",
        dtype=str,          # read everything as str first; parse later
        keep_default_na=False,
    )

    # Drop completely empty columns/rows
    df = df.dropna(how="all", axis=1).dropna(how="all", axis=0)
    df.columns = [str(c).strip() for c in df.columns]

    # ------------------------------------------------------------------
    # Detect platform & normalise
    # ------------------------------------------------------------------
    platform = detect_platform(df)
    df = normalize_columns(df, platform)

    # ------------------------------------------------------------------
    # Type coercion
    # ------------------------------------------------------------------
    numeric_cols = [
        "likes", "comments", "shares", "saves", "reach", "impressions",
        "followers", "engagement_rate", "video_views", "video_completion_rate",
        "story_exits", "story_replies",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = _parse_numeric(df[col])

    df = _parse_dates(df)
    df = _parse_hashtags(df)

    # Ensure engagement_rate is computed if missing / all zeros
    if df["engagement_rate"].sum() == 0:
        total_interactions = df["likes"] + df["comments"] + df["shares"] + df["saves"]
        base = df["reach"].replace(0, np.nan)
        df["engagement_rate"] = (total_interactions / base * 100).fillna(0)

    # Sort by date ascending
    if df["date"].notna().any():
        df = df.sort_values("date", na_position="last").reset_index(drop=True)

    return df, platform
