"""
Multi-provider AI integration — auto-detects provider from API key prefix.

Supported providers:
  gsk_...   → Groq         (llama-3.3-70b-versatile)  FREE ⚡
  AIza...   → Google Gemini (gemini-1.5-flash)          FREE
  sk-or-... → OpenRouter   (claude-sonnet-4-5)
  sk-ant-...→ Anthropic    (claude-sonnet-4-5)
"""

from __future__ import annotations

import html
import json
import re
import requests


REQUEST_TIMEOUT = 120

# ── Provider routing ──────────────────────────────────────────────────────────
def _detect_provider(api_key: str) -> tuple[str, str, str]:
    """Return (provider_name, base_url, model)."""
    if api_key.startswith("gsk_"):
        return (
            "groq",
            "https://api.groq.com/openai/v1/chat/completions",
            "llama-3.3-70b-versatile",
        )
    if api_key.startswith("AIza"):
        return (
            "gemini",
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
            "gemini-1.5-flash",
        )
    if api_key.startswith("sk-ant-"):
        return (
            "anthropic",
            "https://api.anthropic.com/v1/messages",
            "claude-sonnet-4-5",
        )
    # Default: OpenRouter
    return (
        "openrouter",
        "https://openrouter.ai/api/v1/chat/completions",
        "anthropic/claude-sonnet-4-5",
    )


def resolve_ai_provider_model(api_key: str) -> tuple[str, str]:
    """Return (provider_name, model_name) for the supplied API key."""
    provider, _, model = _detect_provider(api_key)
    return provider, model


# ── Core LLM call ─────────────────────────────────────────────────────────────
def call_llm(api_key: str, prompt: str, max_tokens: int = 1400, system: str = "") -> str:
    if not api_key:
        raise ValueError("AI API key is not configured on the server.")

    provider, url, model = _detect_provider(api_key)

    # ── Gemini has a different request/response format ────────────────────────
    if provider == "gemini":
        parts = []
        if system:
            parts.append({"text": f"{system}\n\n{prompt}"})
        else:
            parts.append({"text": prompt})

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
        }
        resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    # ── OpenAI-compatible (Groq, OpenRouter, Anthropic via OR) ───────────────
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://smm-analytics.app"
        headers["X-Title"] = "SMM Analytics Platform"

    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7}

    resp = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        raise RuntimeError(f"{provider.upper()} API {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ── JSON extraction ───────────────────────────────────────────────────────────
def _extract_json(text: str) -> dict | list:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except json.JSONDecodeError:
            pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not extract JSON from response: {text[:200]}")


def _extract_html(text: str) -> str:
    """Extract an HTML document/snippet from raw model output."""
    if not text:
        raise ValueError("Empty HTML response")

    html_fence = re.search(r"```html\s*([\s\S]+?)```", text, flags=re.IGNORECASE)
    if html_fence:
        text = html_fence.group(1).strip()

    lower = text.lower()
    if "<html" in lower:
        start = lower.find("<html")
        return text[start:].strip()
    if "<body" in lower:
        start = lower.find("<body")
        return "<html><head><meta charset='utf-8'></head>" + text[start:].strip() + "</html>"
    if "<section" in lower or "<div" in lower:
        return (
            "<html><head><meta charset='utf-8'></head><body>"
            + text.strip()
            + "</body></html>"
        )
    raise ValueError("Model did not return HTML")


def _fallback_html_report(
    analytics: dict,
    top_posts: list[dict],
    anomalies: list[dict] | list,
    insights: dict | None = None,
) -> str:
    """Deterministic HTML report used when LLM HTML generation fails."""
    insights = insights or {}

    def n(val) -> str:
        try:
            return f"{float(val):,.0f}"
        except Exception:
            return "0"

    def pct(val) -> str:
        try:
            return f"{float(val):.2f}%"
        except Exception:
            return "0.00%"

    platform = str(analytics.get("platform", "unknown")).upper()
    date_start = str(analytics.get("date_range_start", ""))[:10] or "N/A"
    date_end = str(analytics.get("date_range_end", ""))[:10] or "N/A"
    total_posts = int(analytics.get("total_posts", 0) or 0)
    avg_er = analytics.get("avg_engagement_rate", 0)
    total_reach = analytics.get("total_reach", 0)
    followers = analytics.get("follower_count", 0)

    executive_summary = insights.get(
        "executive_summary",
        f"{platform} performance from {date_start} to {date_end}: "
        f"{total_posts} posts, {pct(avg_er)} average engagement rate, {n(total_reach)} total reach.",
    )
    recommendations = insights.get("recommendations", []) if isinstance(insights, dict) else []
    if not recommendations:
        recommendations = [
            "Double down on top-performing post formats.",
            "Post at best-performing day/hour windows.",
            "Run weekly A/B tests on caption hooks and CTAs.",
        ]

    kpi_rows = [
        ("Total Posts", str(total_posts)),
        ("Average Engagement Rate", pct(avg_er)),
        ("Median Engagement Rate", pct(analytics.get("median_engagement_rate", 0))),
        ("Total Reach", n(total_reach)),
        ("Total Impressions", n(analytics.get("total_impressions", 0))),
        ("Total Likes", n(analytics.get("total_likes", 0))),
        ("Total Comments", n(analytics.get("total_comments", 0))),
        ("Total Shares", n(analytics.get("total_shares", 0))),
        ("Total Saves", n(analytics.get("total_saves", 0))),
        ("Follower Count", n(followers)),
        ("Follower Growth", n(analytics.get("follower_growth", 0))),
        ("Virality Rate", pct(analytics.get("virality_rate", 0))),
        ("Save Rate", pct(analytics.get("save_rate", 0))),
    ]
    kpi_html = "".join(
        f"<tr><th>{html.escape(label)}</th><td>{html.escape(value)}</td></tr>"
        for label, value in kpi_rows
    )

    top_posts_html = ""
    for idx, post in enumerate(top_posts[:10], start=1):
        caption = str(post.get("caption", "") or "").strip()
        caption = caption[:120] + ("…" if len(caption) > 120 else "")
        top_posts_html += (
            "<tr>"
            f"<td>{idx}</td>"
            f"<td>{html.escape(str(post.get('post_type', 'unknown')))}</td>"
            f"<td>{pct(post.get('engagement_rate', 0))}</td>"
            f"<td>{n(post.get('reach', 0))}</td>"
            f"<td>{n(post.get('likes', 0))}</td>"
            f"<td>{html.escape(caption or '-')}</td>"
            "</tr>"
        )
    if not top_posts_html:
        top_posts_html = "<tr><td colspan='6'>No top posts available.</td></tr>"

    anomaly_items = []
    for a in anomalies[:8]:
        if isinstance(a, dict):
            title = str(a.get("title", "Anomaly detected"))
            desc = str(a.get("description", ""))
            anomaly_items.append(f"<li><strong>{html.escape(title)}</strong> — {html.escape(desc)}</li>")
    anomalies_html = "".join(anomaly_items) or "<li>No critical anomalies detected.</li>"

    rec_html = "".join(f"<li>{html.escape(str(r))}</li>" for r in recommendations[:8])

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(platform)} Analytics Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; margin:0; background:#f8fafc; }}
    .wrap {{ max-width: 1080px; margin: 0 auto; padding: 28px; }}
    .hero {{ background: linear-gradient(120deg, #0ea5e9, #14b8a6); color:#fff; padding: 20px 24px; border-radius: 16px; }}
    .hero h1 {{ margin: 0 0 6px; font-size: 28px; }}
    .hero p {{ margin: 0; opacity: .95; }}
    .grid {{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin: 16px 0 20px; }}
    .k {{ background:#fff; border:1px solid #e2e8f0; border-radius: 12px; padding: 12px; }}
    .k .l {{ font-size: 11px; color:#64748b; text-transform: uppercase; letter-spacing:.08em; }}
    .k .v {{ font-size: 22px; font-weight: 700; margin-top: 2px; }}
    .card {{ background:#fff; border:1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }}
    h2 {{ margin: 0 0 10px; font-size: 16px; letter-spacing:.02em; }}
    table {{ width:100%; border-collapse: collapse; }}
    th, td {{ border-bottom:1px solid #e2e8f0; padding: 8px; text-align:left; font-size: 13px; vertical-align: top; }}
    th {{ color:#475569; font-weight: 600; background: #f8fafc; }}
    ul {{ margin: 0; padding-left: 18px; }}
    li {{ margin-bottom: 8px; line-height: 1.5; }}
    .muted {{ color:#64748b; font-size: 12px; }}
    @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr 1fr; }} }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>{html.escape(platform)} Performance Report</h1>
      <p>{html.escape(date_start)} → {html.escape(date_end)}</p>
    </section>

    <section class="grid">
      <div class="k"><div class="l">Posts</div><div class="v">{total_posts}</div></div>
      <div class="k"><div class="l">Avg ER</div><div class="v">{pct(avg_er)}</div></div>
      <div class="k"><div class="l">Total Reach</div><div class="v">{n(total_reach)}</div></div>
      <div class="k"><div class="l">Followers</div><div class="v">{n(followers)}</div></div>
    </section>

    <section class="card">
      <h2>Executive Summary</h2>
      <p>{html.escape(str(executive_summary))}</p>
    </section>

    <section class="card">
      <h2>KPI Summary</h2>
      <table>
        <tbody>{kpi_html}</tbody>
      </table>
    </section>

    <section class="card">
      <h2>Top Posts</h2>
      <table>
        <thead><tr><th>#</th><th>Type</th><th>ER</th><th>Reach</th><th>Likes</th><th>Caption</th></tr></thead>
        <tbody>{top_posts_html}</tbody>
      </table>
    </section>

    <section class="card">
      <h2>Recommendations</h2>
      <ul>{rec_html}</ul>
    </section>

    <section class="card">
      <h2>Anomalies / Risks</h2>
      <ul>{anomalies_html}</ul>
      <p class="muted">Generated fallback report template.</p>
    </section>
  </div>
</body>
</html>"""


# ── Full insights generation ──────────────────────────────────────────────────
def generate_full_insights(
    api_key: str,
    analytics: dict,
    top_posts: list,
    anomalies: list,
    forecast: dict,
) -> dict:
    platform     = analytics.get("platform", "unknown")
    total_posts  = analytics.get("total_posts", 0)
    avg_er       = analytics.get("avg_engagement_rate", 0)
    median_er    = analytics.get("median_engagement_rate", 0)
    er_p90       = analytics.get("er_p90", 0)
    total_reach  = analytics.get("total_reach", 0)
    total_likes  = analytics.get("total_likes", 0)
    total_comments = analytics.get("total_comments", 0)
    total_shares = analytics.get("total_shares", 0)
    total_saves  = analytics.get("total_saves", 0)
    follower_count  = analytics.get("follower_count", 0)
    follower_growth = analytics.get("follower_growth", 0)
    engagement_trend = analytics.get("engagement_trend", "flat")
    reach_growth_rate = analytics.get("reach_growth_rate", 0)
    posting_freq = analytics.get("posting_frequency", 0)
    best_day     = analytics.get("best_posting_day", 0)
    best_hour    = analytics.get("best_posting_hour", 0)
    top_post_type = analytics.get("top_post_type", "")
    virality_rate = analytics.get("virality_rate", 0)
    save_rate    = analytics.get("save_rate", 0)
    date_start   = analytics.get("date_range_start", "")
    date_end     = analytics.get("date_range_end", "")

    day_names = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    best_day_name = day_names[best_day] if 0 <= best_day <= 6 else "Unknown"

    ptb = analytics.get("post_type_breakdown", {})
    ptb_summary = "; ".join(
        f"{t}: er={v.get('avg_er',0):.1f}% n={v.get('count',0)}"
        for t, v in ptb.items()
    )

    top_posts_line = " | ".join(
        f"ER={p.get('engagement_rate',0):.1f}% {p.get('post_type','?')}"
        for p in top_posts[:4]
    )

    er_fc    = forecast.get("engagement_rate", {})
    reach_fc = forecast.get("reach", {})
    fc_summary = (
        f"ER 30d: trend={er_fc.get('trend','?')} projected={er_fc.get('projected_30d',0):.2f}%. "
        f"Reach 30d: trend={reach_fc.get('trend','?')} projected={int(reach_fc.get('projected_30d',0)):,}."
    )

    prompt = f"""Social media analytics expert. Return ONLY valid JSON, no prose.

DATA: {platform} | {str(date_start)[:10]}→{str(date_end)[:10]} | {total_posts} posts
ER: avg={avg_er:.2f}% median={median_er:.2f}% p90={er_p90:.2f}% trend={engagement_trend}
Reach:{int(total_reach):,} growth={reach_growth_rate:.1f}% | Followers:{int(follower_count):,} growth={int(follower_growth):,}
Likes:{int(total_likes):,} Comments:{int(total_comments):,} Shares:{int(total_shares):,} Saves:{int(total_saves):,}
Virality:{virality_rate:.2f}% SaveRate:{save_rate:.2f}% | Best:{best_day_name} {best_hour}:00 | TopType:{top_post_type}
Types: {ptb_summary} | Freq:{posting_freq:.1f}/wk
TopPosts: {top_posts_line}
Anomalies: {len(anomalies)} detected | Forecast: {fc_summary}

Return this JSON:
{{"executive_summary":"<3 sentences with numbers>","performance_score":<0-100>,"key_highlights":["<h1>","<h2>","<h3>","<h4>"],"content_analysis":"<2 sentences>","audience_insights":"<2 sentences>","anomaly_commentary":"<1 sentence>","growth_forecast_summary":"<1 sentence>","recommendations":["<r1>","<r2>","<r3>","<r4>","<r5>"],"content_strategy_30d":{{"week_1":"<w1>","week_2":"<w2>","week_3":"<w3>","week_4":"<w4>"}},"growth_opportunities":[{{"lever":"<l1>","estimated_impact":"<i1>","rationale":"<why>"}}],"risk_flags":["<rf1>","<rf2>"]}}"""

    system = "You are an expert social media analyst. Always respond with valid JSON only."

    try:
        raw = call_llm(api_key, prompt, max_tokens=1400, system=system)
        result = _extract_json(raw)
        if not isinstance(result, dict):
            raise ValueError("Expected a JSON object")
        return result
    except Exception as e:
        return {
            "executive_summary": f"Processed {total_posts} posts on {platform} with {avg_er:.2f}% avg ER.",
            "performance_score": 50,
            "performance_score_reasoning": "Score estimated — AI error.",
            "key_highlights": [f"Avg ER: {avg_er:.2f}%", f"Total reach: {int(total_reach):,}"],
            "content_analysis": "AI analysis unavailable.",
            "audience_insights": "AI analysis unavailable.",
            "anomaly_commentary": f"{len(anomalies)} anomalies detected.",
            "growth_forecast_summary": fc_summary,
            "recommendations": ["Review top-performing post types", "Maintain consistent posting schedule"],
            "content_strategy_30d": {"week_1": "Focus on top post types", "week_2": "A/B test captions",
                                     "week_3": "Increase posting frequency", "week_4": "Review and iterate"},
            "growth_opportunities": [{"lever": "Post type optimisation", "estimated_impact": "+10%", "rationale": "Top type outperforms others"}],
            "risk_flags": [f"AI error: {str(e)[:100]}"],
            "_error": str(e),
        }


# ── Post explanation ──────────────────────────────────────────────────────────
def generate_post_explanation(api_key: str, post: dict, avg_er: float, platform: str) -> str:
    post_er   = post.get("engagement_rate", 0)
    direction = "outperformed" if post_er > avg_er else "underperformed"
    delta_pct = ((post_er - avg_er) / avg_er * 100) if avg_er else 0

    prompt = (
        f"{platform} post {direction} average. "
        f"Post ER:{post_er:.2f}% vs avg:{avg_er:.2f}% (delta:{delta_pct:+.1f}%). "
        f"Type:{post.get('post_type','?')} "
        f"Likes:{int(post.get('likes',0)):,} Comments:{int(post.get('comments',0)):,} "
        f"Shares:{int(post.get('shares',0)):,} Saves:{int(post.get('saves',0)):,} "
        f"Reach:{int(post.get('reach',0)):,} "
        f"Caption: {str(post.get('caption',''))[:150]}\n\n"
        f"In 2-3 sentences, explain why this post {direction} based on the data."
    )
    try:
        return call_llm(api_key, prompt, max_tokens=250)
    except Exception as e:
        return f"This post {direction} by {delta_pct:+.1f}%. (AI unavailable: {e})"


# ── Caption generation ────────────────────────────────────────────────────────
def generate_captions(
    api_key: str, topic: str, tone: str, platform: str,
    count: int, analytics_context: dict | None = None,
) -> list[dict]:
    context = ""
    if analytics_context:
        avg_er    = analytics_context.get("avg_engagement_rate", 0)
        top_type  = analytics_context.get("top_post_type", "")
        top_tags  = [h["tag"] for h in analytics_context.get("top_hashtags", [])[:5]]
        context   = f" Account avg ER={avg_er:.2f}%, top type={top_type}, top tags={','.join(top_tags)}."

    count = min(max(count, 1), 10)
    prompt = (
        f"Generate {count} {platform} captions for: '{topic}'. Tone: {tone}.{context}\n"
        f"Return JSON array of {count} objects: "
        '[{"caption":"...","hashtags":["..."],"hook":"...","call_to_action":"..."}]\n'
        "Return ONLY valid JSON array."
    )
    try:
        raw    = call_llm(api_key, prompt, max_tokens=1200)
        result = _extract_json(raw)
        if isinstance(result, list):
            return result[:count]
        if isinstance(result, dict) and "captions" in result:
            return result["captions"][:count]
        return [result] if isinstance(result, dict) else []
    except Exception as e:
        return [{"caption": f"[Error: {e}]", "hashtags": [], "hook": "", "call_to_action": ""}]


# ── Hashtag strategy ──────────────────────────────────────────────────────────
def generate_hashtag_strategy(
    api_key: str, platform: str, niche: str, top_hashtags: list[dict],
) -> dict:
    existing = ", ".join(h["tag"] for h in top_hashtags[:8]) if top_hashtags else "none"
    prompt = (
        f"Create a {platform} hashtag strategy for niche: '{niche}'. "
        f"Current top hashtags: {existing}.\n"
        'Return JSON: {"mega":[{"tag":"#...","approx_posts":"10M+","rationale":"..."}],'
        '"macro":[...],"micro":[...],"niche":[...],'
        '"recommended_mix":"...","strategy_notes":"...","avoid":["..."]}\n'
        "Return ONLY valid JSON."
    )
    try:
        raw = call_llm(api_key, prompt, max_tokens=1000)
        return _extract_json(raw)
    except Exception as e:
        return {"mega": [], "macro": [], "micro": [], "niche": [],
                "recommended_mix": "Error", "strategy_notes": str(e), "avoid": []}


def generate_html_report(
    api_key: str,
    analytics: dict,
    top_posts: list[dict],
    anomalies: list[dict] | list,
    insights: dict | None = None,
) -> str:
    """Generate a full HTML analytics report document."""
    insights = insights or {}

    # Keep payload compact for reliability/cost.
    payload = {
        "platform": analytics.get("platform"),
        "date_range_start": analytics.get("date_range_start"),
        "date_range_end": analytics.get("date_range_end"),
        "total_posts": analytics.get("total_posts"),
        "avg_engagement_rate": analytics.get("avg_engagement_rate"),
        "median_engagement_rate": analytics.get("median_engagement_rate"),
        "total_reach": analytics.get("total_reach"),
        "total_impressions": analytics.get("total_impressions"),
        "total_likes": analytics.get("total_likes"),
        "total_comments": analytics.get("total_comments"),
        "total_shares": analytics.get("total_shares"),
        "total_saves": analytics.get("total_saves"),
        "follower_count": analytics.get("follower_count"),
        "follower_growth": analytics.get("follower_growth"),
        "engagement_trend": analytics.get("engagement_trend"),
        "reach_growth_rate": analytics.get("reach_growth_rate"),
        "posting_frequency": analytics.get("posting_frequency"),
        "best_posting_day": analytics.get("best_posting_day"),
        "best_posting_hour": analytics.get("best_posting_hour"),
        "top_post_type": analytics.get("top_post_type"),
        "virality_rate": analytics.get("virality_rate"),
        "save_rate": analytics.get("save_rate"),
        "post_type_breakdown": analytics.get("post_type_breakdown", {}),
        "top_posts": top_posts[:10],
        "anomalies": anomalies[:10] if isinstance(anomalies, list) else [],
        "insights": insights,
    }

    prompt = f"""You are a senior social media analyst and report designer.
Return ONLY a complete, valid HTML5 document (no markdown, no code fences).

Use this JSON data:
{json.dumps(payload, ensure_ascii=False, default=str)}

Report requirements:
- Include <html>, <head>, <body>, and inline CSS.
- Professional one-page style with clear sections:
  1) Executive Summary
  2) KPI Snapshot cards
  3) KPI Table
  4) Top Posts table
  5) Recommendations (bullet list)
  6) Risk/Anomaly commentary
  7) 30-day action plan
- Use actual numbers from data and mention platform + date range.
- Keep wording business-focused and concise.
- No external JS, no external CSS, no images from remote URLs.
- Ensure output renders well on desktop and mobile.
"""

    try:
        raw = call_llm(api_key, prompt, max_tokens=2600)
        return _extract_html(raw)
    except Exception:
        return _fallback_html_report(
            analytics=analytics,
            top_posts=top_posts,
            anomalies=anomalies,
            insights=insights,
        )
