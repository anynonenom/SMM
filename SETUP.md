# EIDEN SMM Analytics — Setup Guide

Full-stack SMM analytics with Claude AI, deployed 100% on Cloudflare's free tier.

## Architecture

```
frontend/   → Next.js  → Cloudflare Pages  (free)
worker/     → Hono.js  → Cloudflare Workers (free: 100k req/day)
                       → Cloudflare D1      (free: 5 GB SQLite)
                       → Cloudflare R2      (free: 10 GB storage)
AI          → Anthropic Claude API (pay-per-use, ~$0.003/analysis)
```

---

## Prerequisites

- Node.js 18+
- Cloudflare account (free) — cloudflare.com
- Anthropic API key — console.anthropic.com

---

## Step 1 — Install dependencies

```bash
# Install root + all workspaces
npm install
cd frontend && npm install
cd ../worker && npm install
cd ..
```

---

## Step 2 — Set up Cloudflare resources

```bash
cd worker

# Login to Cloudflare
npx wrangler login

# Create D1 database (copy the database_id it prints)
npm run db:create
# → paste the database_id into wrangler.toml

# Create R2 bucket
npm run r2:create

# Run DB migrations
npm run db:init

# Set your Anthropic API key as a secret
npx wrangler secret put ANTHROPIC_API_KEY
# → paste your sk-ant-... key when prompted
```

---

## Step 3 — Run locally

```bash
# Terminal 1 — Worker API (port 8787)
cd worker && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

---

## Step 4 — Deploy to Cloudflare (production)

```bash
# Deploy Worker API
cd worker && npm run deploy
# Note the worker URL (e.g. https://eiden-smm-worker.YOUR.workers.dev)

# Update frontend/.env.local with the worker URL:
# NEXT_PUBLIC_API_URL=https://eiden-smm-worker.YOUR.workers.dev

# Build & deploy frontend to Cloudflare Pages
cd frontend && npm run build
# Then drag-and-drop the `out/` folder to Cloudflare Pages dashboard
# OR use: npx wrangler pages deploy out --project-name=eiden-smm
```

---

## How to use

1. Open the dashboard
2. **Upload a CSV** — export analytics from Instagram, LinkedIn, TikTok, etc.
   - Instagram: Creator Studio → Insights → Export
   - LinkedIn: Analytics → Export CSV
   - TikTok: Creator Center → Analytics → Export
3. **View KPI dashboard** — followers, engagement rate, reach, likes
4. **Posts tab** — sortable table of every post with ER highlighting
5. **AI Insights** — click "Generate AI Insights" for Claude's analysis
6. **Captions** — generate platform-optimised captions with hashtags

---

## Supported CSV Platforms

| Platform  | Auto-detected via               |
|-----------|----------------------------------|
| Instagram | saves, carousel, reel columns    |
| LinkedIn  | unique_impressions, ctr columns  |
| TikTok    | video_views, watch_time columns  |
| Twitter/X | retweets, quote_tweets columns   |
| Facebook  | page_likes, post_clicks columns  |
| YouTube   | watch_time, subscribers columns  |
| Generic   | fallback for any CSV format      |

---

## Free tier limits (Cloudflare)

| Resource        | Free Limit           |
|-----------------|----------------------|
| Workers requests| 100,000 / day        |
| D1 reads        | 5M / day             |
| D1 writes       | 100K / day           |
| D1 storage      | 5 GB                 |
| R2 storage      | 10 GB                |
| R2 operations   | 1M Class A, 10M B/mo |
| Pages deploys   | 500 / month          |

For a typical SMM analytics tool, you will not hit these limits.

---

## AI HTML/PDF report (backend mode)

If you are running the Python backend (`backend/`) with the Next.js frontend:

1. Set backend key in `backend/.env`:
   - `AI_API_KEY=AIza...` (Gemini recommended)
2. New report endpoints:
   - `POST /api/ai/report/html` with body `{"upload_id":"...", "force": false}`
   - `GET /api/ai/report/html/<upload_id>`
   - `GET /api/ai/report/pdf/<upload_id>`

The Reports page now supports AI HTML report generation, live preview, HTML download, and PDF download.

---

## Sample CSV fixtures

Generate test files for Instagram, LinkedIn, TikTok, and Facebook:

```bash
python3 backend/scripts/generate_sample_csvs.py
```

Files are written to `sample-data/`.
