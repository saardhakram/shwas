# Shwas (श्वास) — Urban Air Quality Assistant

> **Shwas turns invisible smog into a number families feel — cigarettes per day — then helps them bring it down with a daily plan, an AI home scan, cleaner routes, a custom 48-hour ML forecast, and neighborhood action — in 6 Indian languages.**

Built with **Google Antigravity** for **PromptWars: Virtual — Challenge 06: Urban Air Quality Assistant** (Hack2skill × Google for Developers).

---

## 1. How Shwas Meets Challenge 06

> *"Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices."*

| Challenge 06 Requirement | Shwas Feature | Implementation |
|---|---|---|
| **Low-emission daily routines** | **Daily Air Plan (`/today`)** | Gemini builds a personalized 5–6 step daily timeline using live AQI, 48-hour forecast windows, family ages/health flags, and home setup. |
| **Indoor air quality hacks** | **Shwas Scan (`/scan`)** | Upload or snap a photo of a room, kitchen, or street-facing window → Gemini Vision detects indoor sources (incense, unvented stove, road ingress) with glowing bounding boxes and one-tap **"Add to my plan"**. |
| **Sustainable alternatives** | **Clean Routes (`/routes`)** | Compares **Metro, Walk, Two-Wheeler, Auto, and Car** on smog exposure (cigarettes), travel time, and **CO₂ emissions**. Recommendations balance lung health and sustainability (never recommending Car when Metro/Walk/Bike is within 0.02 cigarettes and 15 min). |
| **Tailored to location & lifestyle** | **5-Step Onboarding (`/onboarding`)** | Captures language (English, हिंदी, తెలుగు, தமிழ், বাংলা, मराठी), GPS/city, family members (age, asthma/heart/pregnancy), home factors (road-facing windows, purifier, chimney, cooking fuel), and commute mode. |
| **Clearly explain direct impact** | **Cigarette Counter** | Berkeley Earth equivalent (`22 µg/m³ PM2.5 for 24h ≈ 1 cigarette`). Computed deterministically in code (`src/lib/cigarettes.ts`, `src/lib/fixes.ts`, `src/lib/routeExposure.ts`) — never delegated to LLM arithmetic. |
| **Community action** | **Community (`/community`)** | Society & school groups via 6-character join codes (backed by Supabase RLS + `SECURITY DEFINER` RPC), weekly collective savings leaderboard with streaks, hyperlocal smoke/dust alerts, and downloadable/WhatsApp share cards. |
| **Conversational guidance** | **Ask Shwas (`/ask`)** | Context-aware AI assistant with voice input (Web Speech API), dynamic family suggestion chips, inline AQI/cigarette mini-cards, and medical safety guardrails (20 questions/user/day). |

---

## 2. Architecture

```text
Browser (React 19 + Vite + Tailwind + i18next, hosted on Vercel)
 ├── /today       → Cigarette Counter + 48h Forecast + Gemini Daily Air Plan
 ├── /scan        → Client-side JPEG resize → POST /api/scan (Gemini Vision) → deterministic fixes
 ├── /routes      → Google Maps JS (dark theme) + Google Routes API
 │                  ↳ auto-fallback to Leaflet/OSM + OSRM + batched Open-Meteo PM2.5
 ├── /community   → Supabase Postgres + Realtime + RLS + RPC join_group_by_code + html-to-image
 └── /ask         → POST /api/ask (Gemini + Web Speech API + inline AQI/cigarette mini-cards)

Vercel Serverless Functions (api/*.ts, Node runtime)
 ├── api/geminiClient.ts → Shared Gemini SDK wrapper (gemini-3.5-flash primary + gemini-3.1-flash-lite fallback,
 │                         thinkingLevel: "minimal", retry + fallback budget reservation)
 ├── api/plan.ts         → Daily Air Plan generator + 6h server cache + rule-based fallback
 ├── api/scan.ts         → Gemini Vision indoor pollution hotspot detector
 └── api/ask.ts          → Grounded family Q&A + time-aware exposure mini-card + 20/day rate limit

ML Serving Pipeline (Zero-cost, Zero-cold-start)
 └── GitHub Actions (.github/workflows/forecast.yml, every 6h)
      → fetches latest Delhi PM2.5 & weather → runs LightGBM (ml/model/shwas_lgbm.joblib)
      → upserts 48h predictions into Supabase `forecasts` table
      → App reads fresh (<3h) ML predictions from Supabase, else falls back seamlessly to Open-Meteo
```

### Security & Fallbacks
- **Zero secrets in the browser**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are strictly server-side / GitHub Actions only.
- **Supabase Row Level Security (RLS)**: Enabled across `profiles`, `forecasts`, `groups`, `group_members`, `daily_savings`, and `alerts`. Groups are only readable by members/creators; joining by code happens via `SECURITY DEFINER` RPC `join_group_by_code(code, display_name)` with `EXECUTE` revoked from `anon`.
- **Every external service has an automatic fallback**:
  - Gemini Vision / Plan / Ask → automatic model fallback (`gemini-3.5-flash` → `gemini-3.1-flash-lite`) → deterministic offline plan/audit.
  - Google Maps & Google Routes → automatic fallback to dark-styled **Leaflet + OpenStreetMap** and **OSRM**.
  - Supabase ML Forecast → automatic fallback to live **Open-Meteo Air Quality API** → offline sample curve.

---

## 3. ML Results — Shwas Forecast (48-Hour PM2.5)

Located in [`ml/`](ml/) (Python 3.11, LightGBM, SHAP).

- **Task**: Predict hourly PM2.5 for horizons `+1h` through `+48h` across 3 Delhi stations (**Anand Vihar**, **R.K. Puram**, **ITO**).
- **Split strategy**: Strictly **time-based** (never random) — trained on older seasons, validated chronologically, and tested on the held-out latest Delhi winter (**`2025-11-01` → `2026-02-19`**, **190,224** forecast rows).
- **Features**: Lagged PM2.5 (`t-1`, `t-3`, `t-6`, `t-24`), rolling means (`6h`, `12h`, `24h`), cyclical hour/weekday/month, boundary layer height, wind vector (`u`/`v`), temperature, humidity, precipitation, Diwali / Oct–Nov stubble-burning / weekend flags, and forecast horizon (`1–48h`).

### Held-Out Winter Test Results (1–48h)

| Model | MAE (µg/m³) | RMSE (µg/m³) | AQI Category Accuracy |
|---|---:|---:|---:|
| **Shwas ML (LightGBM)** | **23.44** | **33.23** | **74.1%** |
| Baseline: Same-Hour Yesterday | 37.12 | 52.96 | 64.1% |
| Baseline: Persistence (`next = now`) | 45.23 | 62.01 | 57.3% |

- **Overall improvement**: **+36.9% lower MAE** than the strongest baseline (`23.44` vs `37.12 µg/m³`).

### Error by Horizon Bucket (MAE, µg/m³)

| Horizon | Shwas ML (LightGBM) | Persistence | Same-Hour Yesterday |
|---|---:|---:|---:|
| **1–6h** | **18.49** | 26.95 | 31.99 |
| **7–12h** | **21.45** | 45.80 | 31.99 |
| **13–24h** | **23.27** | 43.69 | 32.02 |
| **25–48h** | **25.25** | 50.43 | 42.23 |

### Top SHAP Features (Mean |SHAP| µg/m³)
1. `target_boundary_layer_height` (`12.40`)
2. `pm25_roll_24h` (`12.23`)
3. `target_temperature_2m` (`6.63`)
4. `pm25_now` (`6.48`)
5. `pm25_roll_12h` (`5.81`)

Full evaluation report and charts (`predicted_vs_actual.png`, `error_by_horizon.png`, `shap_importance.png`) are saved in [`ml/reports/metrics.md`](ml/reports/metrics.md).

> **Honest Limitations & Methodological Notes**
> 1. **Training target source**: Because no `OPENAQ_API_KEY` was configured during collection, historical hourly PM2.5 was downloaded from the **Open-Meteo Air Quality (Copernicus CAMS)** archive rather than raw CPCB ground-truth monitors. `ml/collect.py` supports OpenAQ v3 CPCB ingestion directly when `OPENAQ_API_KEY` is provided.
> 2. **Observed vs. forecasted test weather**: During held-out winter evaluation, future-hour meteorological features (`target_boundary_layer_height`, wind, temperature) came from historical observed/reanalysis archive data rather than archived NWP weather forecasts. Live real-time prediction error using live forecasted weather may therefore be somewhat higher than the `23.44 µg/m³` offline test MAE.

---

## 4. Local Setup & Running

### Prerequisites
- **Node.js 20+** and **npm**
- **Python 3.11** (optional — only needed to re-train or test the ML pipeline in `ml/`)

### 1. Install & Configure Environment
```bash
git clone https://github.com/saardhakram/shwas.git
cd shwas
npm install --legacy-peer-deps
cp .env.example .env.local
```
Fill in `.env.local` using the Environment Variables table below.

### 2. Run Locally
```bash
npm run dev
```
Vite dev middleware automatically mounts `/api/plan`, `/api/scan`, and `/api/ask` locally on `http://localhost:5173`.

### 3. Run Tests & Production Build
```bash
# TypeScript / Vitest suite (cigarettes, plan, fixes, routes, ask, community, forecast)
npm test

# Production bundle check
npm run build

# ML feature & leakage tests (Python)
python -m venv ml/.venv
ml/.venv/Scripts/pip install -r ml/requirements.txt   # or source ml/.venv/bin/activate on macOS/Linux
ml/.venv/Scripts/pytest ml/test_features.py -v
```

### 4. Supabase Database Migrations
Apply the SQL files in `supabase/migrations/` in order via the Supabase SQL Editor:
1. `supabase/migrations/002_forecasts.sql` — `forecasts` table for 48h ML predictions (public read, service-role write).
2. `supabase/migrations/003_community.sql` — `groups`, `group_members`, `daily_savings`, `alerts` + RLS + Realtime.
3. `supabase/migrations/004_restrict_is_group_member.sql` — Revokes `EXECUTE` on `is_group_member(uuid)` from `public, anon`.
4. `supabase/migrations/005_join_by_code.sql` — Adds `SECURITY DEFINER` RPC `join_group_by_code(code, display_name)` and restricts `groups` `SELECT` to members/creators only.

### 5. Deploy to Vercel
- Import the repository in Vercel (`vercel.json` is pre-configured to serve `api/*.ts` as Node serverless functions and rewrite SPA routes to `/index.html`).
- Add the Environment Variables below in **Vercel → Project Settings → Environment Variables**.
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as **GitHub Repository Secrets** for `.github/workflows/forecast.yml`.

---

## 5. Environment Variables

| Variable | Scope | Required? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (Vercel + `.env.local`) | Optional (recommended) | Supabase project URL for profiles, ML forecasts, and Community. |
| `VITE_SUPABASE_ANON_KEY` | Frontend (Vercel + `.env.local`) | Optional (recommended) | Supabase anon/publishable key (protected by RLS). |
| `VITE_GOOGLE_MAPS_KEY` | Frontend (Vercel + `.env.local`) | Optional | Google Maps JS + Places + Routes key (restrict by HTTP referrer). Auto-falls back to Leaflet + OSM + OSRM if omitted or quota-limited. |
| `GEMINI_API_KEY` | **Server-only** (Vercel + `.env.local`) | Required for AI | Google AI Studio key used by `/api/plan`, `/api/scan`, and `/api/ask`. Never exposed to client. |
| `GEMINI_MODEL` | **Server-only** | Optional | Primary model (default: `gemini-3.5-flash`). Fallback: `gemini-3.1-flash-lite`. |
| `SUPABASE_URL` | **GitHub Actions Secret** | Required for ML cron | Supabase URL used by `ml/predict.py`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **GitHub Actions Secret** | Required for ML cron | Service-role key used by `ml/predict.py` to upsert `forecasts`. Never expose to client. |
| `OPENAQ_API_KEY` | Local / GitHub Actions | Optional | Enables OpenAQ v3 CPCB ground-station ingestion in `ml/collect.py` & `ml/predict.py`. |

---

## 6. Supported Languages

Shwas includes full UI translations (`i18next`) and multilingual Gemini responses across 6 languages:
- **English** (`en`)
- **हिंदी — Hindi** (`hi`)
- **తెలుగు — Telugu** (`te`)
- **தமிழ் — Tamil** (`ta`)
- **বাংলা — Bengali** (`bn`)
- **मराठी — Marathi** (`mr`)
