# swats.bio — Overhaul PRD

## Original problem statement
Deep audit + overhaul of the existing swats.bio codebase (Node/Express + PostgreSQL + Cloudinary + Stripe + Discord bot backend; React 19 + CRACO/CRA + Tailwind 3 frontend). Preserve existing backend architecture (do NOT create a new/Emergent backend until the user says "take emergent backends"). Make backend Railway-ready; user pushes to GitHub and deploys themselves (Railway + Vercel). Do not run full test/setup in this environment.

## Stack (actual, confirmed)
- Backend: `/app/backend` — Express (ESM), `pg` (PostgreSQL), Cloudinary, Stripe, JWT (jsonwebtoken), ws, Discord bot. Entry `server.js`, routes under `routes/`.
- Frontend: `/app/frontend` — React 19, CRACO + react-scripts, Tailwind 3, framer-motion, radix/shadcn ui. Pages under `src/pages`, landing under `src/components/landing`.
- Deploy targets: Railway (backend) + Vercel (frontend). `vercel.json` present.

## Done (2026-06)
- Moved real project into /app (was empty Emergent template).
- **PREVIEW NOW LIVE**: rewired this env to run the real stack — installed PostgreSQL 15, created `swats` DB, Express backend on :8001 (supervisor `express_backend`, replaces dead uvicorn), CRA/CRACO frontend on :3000. `backend/.env` created (DATABASE_URL, PORT, admin seed).
- **Fixed 2 real DB schema bugs** in `db.js` that broke fresh deploys (would also break a fresh Railway DB): (1) `ALTER/UPDATE devlogs` ran before `CREATE TABLE devlogs`; (2) `ALTER COLUMN iv/ciphertext/alg DROP NOT NULL` on chat_messages where those legacy columns never existed. Both rolled back the whole schema transaction → 0 tables. Now 18 tables init cleanly.
- Admin/owner seeded: admin@swats.bio / SwatsAdmin!2026 (see test_credentials.md). Login verified.
- **DOWNLOAD SITE** button on homepage → `GET /api/download-site` (`backend/routes/download.js`, archiver). Verified zip excludes node_modules/.git/**.env**.
- Contact email **riotsoffical@proton.me** via `CONTACT_EMAIL` in `lib/api.js`, wired into Footer + Legal (+ new Legal contact section).
- **Explore section** (replaces Devlogs in nav): new `GET /api/explore` (search/sort/tier in `public.js`), new `pages/Explore.jsx` with full profile cards, debounced search, sort + tier filters, verified badges, view counts, and a hover contextual popup menu (View / Copy link). Routes + Navbar rewired. Seeded 6 real demo profiles. Verified live (7 cards render).

## Turn 7 (2026-06)
- Removed LeaderboardShowcase ("Top of the leaderboard") and ProfileShowcase ("straight from the leaderboard", rendered inside FeaturesCustomizer) from the landing page.
- Added `components/landing/WidgetShowcase.jsx` under "Customize Without Limits": 3D-tilted cards (rotateX, straighten on hover) — real Spotify track embed (3P61wVXNlCuTa7zSnTN3Zv), real SoundCloud embed (soundcloud.com/bondages), and branded link cards for TikTok (@koniwtfs), Discord user (ID 1546745348020772915), Discord server (discord.gg/a9uwptuepD). Verified live: 6 widget cards, both old sections gone.

## Turn 6 (2026-06)
- Dashboard card-editor fixup: `SliderRow` in `Editor.jsx` now uses local state while dragging and commits only on release (`onValueCommit`) instead of `set()` on every pixel — the card dials (blur/fill-alpha/outline-alpha/radius/width) no longer lag/jump from full-editor re-renders. Verified by testing_agent (iteration_1): all sliders/chips/switches work, values persist (PUT /api/me/profile 200), no console errors, 0 failures.

## Turn 5 (2026-06)
- Download Site = FULL: `download.js` now only excludes node_modules/.git/*.log (includes .env, build, uploads, configs). ⚠️ endpoint is PUBLIC so .env secrets are in the zip — fine for owner, risky if shared.
- Ranked system: new `GET /api/ranked` (ORDER BY views) + `pages/Ranked.jsx` (numbered leaderboard, medals top-3, avatars, verified/PRO, real views). Route /!/ranked + /ranked, added to Navbar. Score = validated views (interactions fold in when tracked). Verified live.
- Legal fully redesigned (new format): `pages/Legal.jsx` now document-style — sticky left section nav + fully expanded numbered clauses (no accordions). 6 sections. Verified live.
- GitHub→Railway Q answered: auto-deploys on push if connected; existing users safe (all db.js changes IF NOT EXISTS + idempotent); preview DB is ephemeral, Railway Postgres persists.
- PENDING: Crosshair→Cloudinary. `backend/routes/upload.js` already does multer+Cloudinary; needs CLOUDINARY_* keys (NOT in preview) to build+verify the crosshair upload/validation/preview/scale/save UI + preset removal.

## Turn 4 (2026-06)
- Leaderboard carousel animation now smooth (no remount, spring, short-way wrap, off-stage parked cards).
- All fake data removed: seeded demo users gone; DB real-only (admin "Owner" sole account).
- Legal expanded to 6 sections: Terms (9), Privacy (8), Refund (4), DMCA (3), Cookie (2), Disclaimer (3). Verified live.
- NOTE: Postgres data is ephemeral in preview; DB re-inits + re-seeds admin on restart.
- PENDING: Crosshair upload (needs Cloudinary — not configured here), Overview overhaul (needs stats endpoint + UI), effects rebuild, ranked/bot/pricing.

## Remaining next (requested)
- **Docs hub** ✅ DONE — `/!/docs` (`pages/Docs.jsx`): GitHub-Docs-style sticky sidebar, 11 sections (Getting Started, Account, Profiles, Widgets, Customization, Effects, Rewards, Pricing, Bots, Admin, Troubleshooting), live search, themed cards. Routes + footer link added. Verified live.
- Leaderboard Showcase ✅ DONE — `components/landing/LeaderboardShowcase.jsx`: center-focused auto-rotating carousel (center card prominent, 2 side cards faded/blurred behind, fade + spring transitions, auto-swap every 5s, pause on hover, prev/next + dot nav, tap side card to bring forward). Uses real `useTopProfiles` data + `ProfilePreview`. Swapped into Landing (above UserCarousel). Verified live (7 profiles, dots, center seat).
- Custom Crosshair Upload: replace presets w/ image upload (validation/preview/scale/position/save) + real color pickers. [NEEDS backend upload wiring — pending]
- Effects/overlays rebuild to exact allowed list: requires NEW canvas painters (constellation, galaxy, love fall, frosted, snow flake) in `lib/ghostFx.js` + `constants/effects.js` trim. Source of truth: `frontend/src/constants/effects.js`. [pending — risky to trim without renderers]
- Overview overhaul, full ranked system, better bot system, Legal expansion, pricing. [pending]

## Backlog (from problem statement — NOT yet done, needs prioritization)
P0/P1:
- Remove all fake/placeholder/mock/hardcoded data; connect every feature to real backend.
- Dashboard visual overhaul (spacing, borders, hover, transitions) across all pages.
- Rebuild: homepage, dashboard overview (real stats/activity/rewards), rewards system, view-based rewards, admin dashboard, bot management, pricing.
- Replace Devlogs section with **Explore** (profile discovery: full profile cards, filters, search, hover popup menu).
- Improve real profile pages (esp. from leaderboard) — full-sized detailed.
- Leaderboard/profile showcase: center-focused 3-profile carousel with fade/auto-swap.
- Effects system: ONLY rain, snowv1, snowv2, shooting stars, thunder, constellation, galaxy, rain fall, love fall, bleeding, TV, snow flake, frosted. Remove others.
- Overlays: ONLY snow, rain, VHS, grain, spotlight, dotters (many small dots). Remove others.
- Crosshair system: custom image upload (validation/preview/position/scale/save); remove presets + preset color spinners. Add color pickers where needed.
- Legal section expansion + full docs area at `/!/docs` (GitHub-Docs-style, swats.bio theming).
- Remove notes/comments from source (keep licensing/correctness-critical).
- Consistent contextual popup menus on media/profile/widget/card/image elements.
- Audit: no broken links/dead buttons/fake stats/duplicates/disconnected backend.
- Pricing structure/presentation/clarity improvements.

## Constraints / notes
- Stack can't run in this Vite/FastAPI/Mongo supervisor env without major reconfig; user deploys on Railway/Vercel and asked not to set up/test here. Backend route verified by running `node server.js` directly.
- `/app/download-site` excludes `.env` — safe for public download.
