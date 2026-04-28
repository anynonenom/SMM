"""
Generate platform-specific sample CSVs for local testing.

Outputs:
  sample-data/instagram_sample.csv
  sample-data/linkedin_sample.csv
  sample-data/tiktok_sample.csv
  sample-data/facebook_sample.csv
"""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "sample-data"
ROW_COUNT = 42
SEED = 20260412


def _date_at(i: int) -> str:
    start = date(2026, 1, 1)
    return (start + timedelta(days=i)).isoformat()


def _hashtags(pool: list[str], n: int = 3) -> str:
    return " ".join(f"#{x}" for x in random.sample(pool, k=n))


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def generate_instagram(rows: int = ROW_COUNT) -> Path:
    fieldnames = [
        "date",
        "post_id",
        "post_type",
        "caption",
        "likes",
        "comments",
        "shares",
        "saves",
        "reach",
        "impressions",
        "followers",
        "story_exits",
        "story_replies",
        "hashtags",
    ]
    pool = ["growth", "reel", "brand", "marketing", "community", "creator", "engagement", "launch"]
    data = []
    followers = 18000
    for i in range(rows):
        ptype = random.choice(["reel", "carousel", "image", "story"])
        likes = random.randint(120, 1800)
        comments = random.randint(8, 220)
        shares = random.randint(3, 180)
        saves = random.randint(5, 260)
        reach = random.randint(1500, 65000)
        impressions = reach + random.randint(50, 9000)
        followers += random.randint(-8, 45)
        data.append({
            "date": _date_at(i),
            "post_id": f"ig_{10000+i}",
            "post_type": ptype,
            "caption": f"Instagram sample post {i+1} about {random.choice(['product', 'tips', 'storytelling', 'tutorial'])}",
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "reach": reach,
            "impressions": impressions,
            "followers": max(followers, 1),
            "story_exits": random.randint(0, 120) if ptype == "story" else 0,
            "story_replies": random.randint(0, 60) if ptype == "story" else 0,
            "hashtags": _hashtags(pool, n=3),
        })
    out = OUT_DIR / "instagram_sample.csv"
    _write_csv(out, fieldnames, data)
    return out


def generate_linkedin(rows: int = ROW_COUNT) -> Path:
    fieldnames = [
        "date",
        "post_id",
        "content_type",
        "text",
        "reactions",
        "comments",
        "reposts",
        "saves",
        "unique_impressions",
        "impressions",
        "follower_count",
        "ctr",
        "organic_reach",
        "paid_reach",
        "hashtags",
    ]
    pool = ["leadership", "b2b", "career", "brand", "socialselling", "insights", "strategy", "growth"]
    data = []
    followers = 9500
    for i in range(rows):
        ctype = random.choice(["article", "video", "document", "image"])
        reactions = random.randint(30, 900)
        comments = random.randint(3, 150)
        reposts = random.randint(1, 120)
        unique_impressions = random.randint(900, 34000)
        impressions = unique_impressions + random.randint(60, 6000)
        organic = int(unique_impressions * random.uniform(0.6, 0.95))
        paid = max(unique_impressions - organic, 0)
        followers += random.randint(-4, 28)
        data.append({
            "date": _date_at(i),
            "post_id": f"li_{20000+i}",
            "content_type": ctype,
            "text": f"LinkedIn sample post {i+1} covering {random.choice(['industry trend', 'team update', 'case study', 'thought leadership'])}",
            "reactions": reactions,
            "comments": comments,
            "reposts": reposts,
            "saves": random.randint(0, 80),
            "unique_impressions": unique_impressions,
            "impressions": impressions,
            "follower_count": max(followers, 1),
            "ctr": round(random.uniform(0.3, 6.2), 2),
            "organic_reach": organic,
            "paid_reach": paid,
            "hashtags": _hashtags(pool, n=3),
        })
    out = OUT_DIR / "linkedin_sample.csv"
    _write_csv(out, fieldnames, data)
    return out


def generate_tiktok(rows: int = ROW_COUNT) -> Path:
    fieldnames = [
        "date",
        "video_id",
        "post_type",
        "caption",
        "likes",
        "comment_count",
        "share_count",
        "collect_count",
        "video_views",
        "views",
        "new_followers",
        "average_watch_time",
        "video_completion_rate",
        "duets",
        "stitches",
        "hashtags",
    ]
    pool = ["fyp", "tiktoktips", "creator", "viral", "ugc", "trend", "challenge", "socialmedia"]
    data = []
    followers = 22000
    for i in range(rows):
        likes = random.randint(180, 3200)
        comments = random.randint(10, 280)
        shares = random.randint(8, 330)
        saves = random.randint(10, 220)
        views = random.randint(4000, 180000)
        followers += random.randint(-15, 85)
        data.append({
            "date": _date_at(i),
            "video_id": f"tt_{30000+i}",
            "post_type": random.choice(["video", "short"]),
            "caption": f"TikTok sample video {i+1} about {random.choice(['behind the scenes', 'tips', 'product demo', 'day in the life'])}",
            "likes": likes,
            "comment_count": comments,
            "share_count": shares,
            "collect_count": saves,
            "video_views": views,
            "views": views,
            "new_followers": max(followers, 1),
            "average_watch_time": round(random.uniform(3.0, 27.0), 2),
            "video_completion_rate": round(random.uniform(12.0, 92.0), 2),
            "duets": random.randint(0, 35),
            "stitches": random.randint(0, 28),
            "hashtags": _hashtags(pool, n=3),
        })
    out = OUT_DIR / "tiktok_sample.csv"
    _write_csv(out, fieldnames, data)
    return out


def generate_facebook(rows: int = ROW_COUNT) -> Path:
    fieldnames = [
        "date",
        "post_id",
        "type",
        "message",
        "reactions",
        "comment_count",
        "share_count",
        "saves",
        "post_reach",
        "post_impressions",
        "page_likes",
        "post_clicks",
        "negative_feedback",
        "video_views_10s",
        "hashtags",
    ]
    pool = ["facebookmarketing", "smallbusiness", "community", "socialstrategy", "content", "awareness", "campaign", "brand"]
    data = []
    followers = 12500
    for i in range(rows):
        reach = random.randint(1400, 59000)
        impressions = reach + random.randint(50, 12000)
        followers += random.randint(-10, 38)
        data.append({
            "date": _date_at(i),
            "post_id": f"fb_{40000+i}",
            "type": random.choice(["video", "photo", "link", "status"]),
            "message": f"Facebook sample post {i+1} focused on {random.choice(['offer', 'announcement', 'how-to', 'story'])}",
            "reactions": random.randint(70, 1900),
            "comment_count": random.randint(3, 210),
            "share_count": random.randint(1, 260),
            "saves": random.randint(0, 90),
            "post_reach": reach,
            "post_impressions": impressions,
            "page_likes": max(followers, 1),
            "post_clicks": random.randint(20, 2200),
            "negative_feedback": random.randint(0, 45),
            "video_views_10s": random.randint(0, 14000),
            "hashtags": _hashtags(pool, n=3),
        })
    out = OUT_DIR / "facebook_sample.csv"
    _write_csv(out, fieldnames, data)
    return out


def main() -> None:
    random.seed(SEED)
    files = [
        generate_instagram(),
        generate_linkedin(),
        generate_tiktok(),
        generate_facebook(),
    ]
    print("Generated sample CSV files:")
    for p in files:
        print(f"- {p}")


if __name__ == "__main__":
    main()

