# Shwas (श्वास) — "breathing"

> **Shwas turns invisible smog into a number families feel — cigarettes per day — then helps them bring it down with a daily plan, a home scan and cleaner routes, in their own language and together with their community.**

Built for **PromptWars: Virtual — Challenge 06: Urban Air Quality Assistant** (Hack2skill × Google for Developers).

---

## 1. The challenge (official brief)

> Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.

**Rules to remember**
- Must be built with **Google Antigravity** (FAQ: required for all submissions).
- Submission = **code + live preview link** + **narrative** (technical blog post *and* LinkedIn "Build-in-Public" post — do both).
- Deadline: Day 13 of the 14-day cycle — confirm the exact date on the Hack2skill dashboard.
- Support: promptwarssupport@hack2skill.com

### How Shwas covers the brief
| Brief requirement | Shwas feature |
|---|---|
| Low-emission daily routines | Daily Air Plan + Clean Routes |
| Indoor air quality hacks | Shwas Scan |
| Sustainable alternatives | Metro / walk / carpool suggestions, CO₂ shown |
| Tailored to location & lifestyle | Onboarding profile (city, family, home, routine) |
| Clearly explain the impact | Cigarette Counter — every action shows cigarettes saved (+ CO₂) |

---

## 2. Core idea: the Cigarette Counter

Breathing air with **22 µg/m³ of PM2.5 for a full day ≈ smoking 1 cigarette** (Berkeley Earth estimate).

```
cigarettes_today = Σ over places ( PM2.5_at_place ÷ 22 × hours_at_place ÷ 24 )
```

**Example — Delhi winter day (outdoor PM2.5 ≈ 300 µg/m³)**

| Where | Hours | PM2.5 | Cigarettes |
|---|---|---|---|
| Outside (commute, market) | 2 | 300 | 1.1 |
| School / office | 8 | 200 | 3.0 |
| Home, windows open | 14 | 180 | 4.8 |
| **Total** | | | **≈ 9** |

Shut windows + purifier at home (PM2.5 → 60) and take the metro → **≈ 5 cigarettes**.
App message: *"You saved your family 4 cigarettes today."*

- Calculated **per family member** (child at school ≠ grandparent at home).
- Indoor PM2.5 estimated from outdoor level × home factors (windows, purifier, chimney, cooking fuel).
- Shown in-app with a caveat: *awareness estimate, not a medical measurement.*

---

## 3. Features (locked)

| # | Feature | What it does | Priority |
|---|---|---|---|
| 0 | **Daily Air Plan** | Gemini builds today's timeline: when to shut windows, best airing window, commute, kids' play time | Must |
| 1 | **Cigarette Counter** | Hero number per person, "9 → 5 if you follow your plan", saving on every plan item | Must |
| 2 | **Shwas Scan** | Photo of room/kitchen/street → Gemini Vision finds pollution sources → fixes with impact → "Add to my plan" | Must |
| 6 | **Clean Routes** | Compare Metro / Auto / Bike / Walk / Car by time, cigarettes and CO₂; map routes coloured by exposure | Must (mode comparison) / Nice (real map routes) |
| ML | **Shwas Forecast** | Our own trained 48-hour PM2.5 model → better plan timing + "tomorrow's cigarettes" | Must |
| — | **Multilingual** | English, हिंदी, తెలుగు, தமிழ், বাংলা, मराठी (Gemini writes AI text in chosen language; i18next for UI strings) | Must |
| — | **Community** | Society/school groups via join code, leaderboard, local alerts (e.g. garbage burning), WhatsApp share card | Should |
| — | **Ask Shwas** | Chat assistant with voice input: "Can Dadi walk at 6 PM?" | Nice |
| — | **Onboarding** | Language → location → family (age, asthma/heart/pregnancy) → home & routine → animated reveal | Must |

---

## 4. Tech stack (no Google Cloud, no billing)

The rules only require **Google Antigravity**. Everything below runs on free tiers with no credit card.

| Layer | Choice | Cost |
|---|---|---|
| Design | **Google Stitch** (designs only) | Free |
| Build | **Google Antigravity** (required) | Free |
| Frontend | React (Vite) + Tailwind CSS | — |
| Hosting + API | **Vercel** — static frontend + serverless functions (`/api/*`) | Free (Hobby) |
| Database | **Supabase** Postgres — profiles, family, plans, groups, leaderboard, alerts, forecasts | Free |
| Auth | **Supabase Auth** — anonymous (guest) + email magic link (GitHub login optional) | Free |
| Realtime | Supabase Realtime — live leaderboard & local alerts | Free |
| File storage | Supabase Storage — scan photos | Free |
| AI | **Gemini API** via a Google AI Studio key — plan, chat, Vision scan, translation | Free tier |
| Air quality (live + forecast) | **Open-Meteo Air Quality API** (PM2.5, PM10, NO₂, O₃, US AQI; hourly, no key) | Free |
| Ground-truth stations | **OpenAQ** API (CPCB station data) | Free key |
| Weather | **Open-Meteo** forecast + historical archive | Free, no key |
| Map in the app | **Google Maps JS** with the **Maps Demo Key** — dark-styled map, markers, exposure-coloured route polylines | Free, no card (daily limit) |
| Routes | **Google Compute Routes** (Demo Key) for drive / walk / bike | Free, no card (daily limit) |
| Place search | **Google Places UI Kit + Geocoding** (Demo Key) | Free, no card (daily limit) |
| Metro / transit | "Open in Google Maps" button using **Google Maps URLs** (`/maps/dir/?api=1&travelmode=transit`) | Free, no key |
| Map fallback | **Leaflet** + OpenStreetMap, plus OpenRouteService for routes — auto-switch if the demo key's daily limit is hit | Free |
| Charts | Recharts | — |
| i18n | i18next for UI + Gemini for generated text | — |
| Voice input | Browser Web Speech API | Free |
| Share card | html-to-image | — |
| ML training | Python, pandas, LightGBM, SHAP in **Google Colab** | Free |
| ML serving + daily refresh | **GitHub Actions** cron → runs model → writes 48-h forecast rows to Supabase | Free |

**Flow:** Browser (Vercel) shows the Google Map → Vercel `/api/*` functions → Gemini · Open-Meteo · OpenAQ · Google Routes. Forecasts, profiles and community data live in Supabase.

**Google tools used:** Antigravity · Stitch · Gemini · Google Maps — no Google Cloud billing anywhere.

**Why GitHub Actions for ML:** no model server to keep awake (free servers sleep and take ~50 s to wake — bad in a live demo). A scheduled job pre-computes the next 48 hours for each demo station and stores them; the app just reads a table. Instant.

**Metro / transit:** the demo key doesn't cover transit routing. In-app, estimate metro trips as walk-to-station + distance at average metro speed (labelled "estimate"); the Metro card has an **Open in Google Maps** button for real metro directions.

**Rules:**
- Never commit any key to this repo. Use `.env.local` locally and Vercel environment variables in production.
- The Maps key is visible in the browser by design — restrict it to your Vercel domain(s) and `localhost` (HTTP referrer restriction) in the Google Maps key settings.
- Keep the Gemini key server-side: call Gemini only from `/api/*`.
- Turn on Row Level Security for every Supabase table.
- Demo key is for prototyping only and has a daily limit — keep the Leaflet fallback working before judging.

---

## 5. ML: Shwas Forecast (48-hour PM2.5)

The cigarette formula is fixed; ML improves its **input** — the PM2.5 forecast.

1. **Define** — predict PM2.5 for hours +1…+48; start with one city, 3–5 stations.
2. **Collect** — CPCB/OpenAQ hourly PM2.5 (3–5 yrs); Open-Meteo weather history (wind speed/direction, temp, humidity, rain, boundary layer height); events calendar (Diwali, stubble-burning Oct–Nov, holidays).
3. **Clean** — IST timezone, hourly resample, drop sensor errors (negatives, 999s, flat-lines), interpolate short gaps, merge on timestamp + station.
4. **Features** — lags (t-1, t-3, t-24), rolling means (6/12/24 h), hour/weekday/month, weather, event flags, forecast weather for future hours.
5. **Split by time** — train on older winters, validate on part of 2024–25, test on the latest winter. Never random split.
6. **Baselines** — persistence ("next hour = now"), same-hour-yesterday. Model must beat these.
7. **Train** — LightGBM / XGBoost; horizon-as-feature or separate models for 1/6/12/24/48 h; tune a few params.
8. **Evaluate** — MAE (main), RMSE, AQI-category accuracy, error by horizon, predicted-vs-actual plot, SHAP importance. Compare live against the Open-Meteo air-quality forecast during build week.
9. **Deploy** — commit the trained model file to the repo; a GitHub Actions cron (e.g. hourly) fetches latest OpenAQ + Open-Meteo data, runs the model and upserts 48-h forecasts into a Supabase `forecasts` table. Fallback: show the Open-Meteo forecast if a row is missing or stale.
10. **Integrate** — plan timing ("best air 2–4 PM"), tomorrow's cigarettes, route departure times.
11. **Write up** — metrics table + charts for the blog.

---

## 6. Build plan (8 days)

| Day | Work |
|---|---|
| 1 | Setup, onboarding, Daily Air Plan, Cigarette Counter, i18n · **start ML data download** |
| 2 | Finish plan + counter, Open-Meteo / OpenAQ wiring, Supabase schema |
| 3 | Shwas Scan (Gemini Vision) |
| 4 | ML: data cleaning, features, baselines |
| 5 | ML: train, evaluate, deploy, connect |
| 6 | Clean Routes |
| 7 | Community (groups, leaderboard, alerts, share card) + Ask Shwas |
| 8 | Polish, deploy, blog + LinkedIn post (+ Instagram reel), submit |

**Tips:** record screenshots/clips as you go (blog, LinkedIn, reel prize) · keep a fallback for every external service · use one demo city everywhere.

---

## 7. Setup status

| Item | Status |
|---|---|
| Stitch designs | ✅ Today, Scan, Routes, Community, Ask Shwas + design system · ⚠️ verify onboarding screens |
| GitHub repo | ✅ this repo (private — **make public before submitting**) |
| Google Maps Demo Key | ✅ created (no card). Retrieve it from the Google Cloud console → Google Maps Platform → Keys. Add as `VITE_GOOGLE_MAPS_KEY` in `.env.local` / Vercel |
| Gemini API key | ⏳ create at https://aistudio.google.com/apikey → `GEMINI_API_KEY` (server-side only) |
| Supabase project | ✅ `shwas` — Mumbai (`ap-south-1`), URL `https://znjiyhfedmnweoycljys.supabase.co` (Kaizen paused to free the slot) |
| Supabase Auth | ⏳ Dashboard → Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins** (email magic link is on by default) |
| Env template | ✅ `.env.example` — copy to `.env.local` and fill in |
| Vercel project | ⏳ import this repo, add env vars |
| OpenAQ / OpenRouteService keys | ⏳ free sign-up (OpenRouteService only needed for the fallback map) |
| Open-Meteo | ✅ no key needed |

**Not used anymore:** Google Cloud billing, Cloud Run, Firebase. (The earlier `shwas-515315` Google Cloud/Firebase project is unused and costs nothing — leave it or delete it.)

**Links**
- Stitch project: https://stitch.google.com/projects/824895366468295722
- Maps Demo Key docs: https://developers.google.com/maps/demo-key
- Google AI Studio (Gemini key): https://aistudio.google.com/apikey
- Open-Meteo Air Quality API: https://open-meteo.com/en/docs/air-quality-api
- PromptWars page: https://promptwars.in/promptwarsVirtual.html

---

## 8. Stitch prompts (for regenerating designs)

<details>
<summary>Master prompt (Today screen)</summary>

Design a mobile-first web app called "Shwas" (Sanskrit for "breathing") — a GenAI air-quality companion for Indian families living through severe winter smog. Core idea: Shwas converts the air a person breathes into "cigarettes smoked today" (PM2.5 ÷ 22 = 1 cigarette), then helps the family bring that number down through a daily plan, a home scan, and cleaner routes. Vibe: cinematic, atmospheric, hopeful — not clinical. Background gradient shifts with air quality (murky haze → clear dawn teal). Glassmorphism cards, Space Grotesk/Sora for numbers, Inter for body, mint #2DD4BF accent, amber/red for danger, dark mode first. Bottom nav: Today, Scan, Routes, Community, Ask Shwas. Language switcher + family avatar switcher top-right. Today screen: hero "9 cigarettes", "9 → 5 if you follow your plan" arc, family chips, live AQI pill, 48-h "Shwas Forecast (ML)" chart with best window highlighted, "Today's Air Plan" timeline with checkboxes and savings badges.
</details>

<details>
<summary>Scan · Routes · Community · Ask Shwas · Onboarding</summary>

- **Scan:** camera viewfinder + shutter; result photo with hotspot markers (incense, stove without chimney, window facing road); Fixes cards with impact badge and "Add to my plan"; summary "3 fixes found · Save up to 2.4 cigarettes/day".
- **Routes:** From/To + saved places + departure time; map with exposure-coloured routes; Metro/Auto/Bike/Walk/Car cards (time, cigarettes, CO₂) with Recommended ribbon; tip "Leave at 2:30 PM to breathe 40% less smog".
- **Community:** group header + join code; "Together we saved 1,240 cigarettes this week"; leaderboard with streaks; local alerts feed; WhatsApp share card.
- **Ask Shwas:** chat with wind-swirl avatar, suggestion chips, inline mini AQI card, mic + language indicator.
- **Onboarding (5 static screens):** language tiles → location → family + health flags → home & routine → reveal "Your family breathes 9 cigarettes a day. Let's bring it down."
</details>
