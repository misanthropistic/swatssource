# Security

What this codebase actually enforces, what it depends on, and what is still
missing. Written to be checked against the code rather than trusted: every claim
below names the file that implements it.

Last reviewed: 2026-10-16.

---

## 1. Secrets and configuration

| Variable | Required | What it does |
| --- | --- | --- |
| `JWT_SECRET` | **yes, in production** | Signs session tokens. |
| `SESSION_COOKIE` | no | `1` puts the session in an HttpOnly cookie instead of `localStorage`. |
| `SESSION_COOKIE_SAMESITE` | no | `lax` (default), `strict`, or `none` when the frontend is on another host. |
| `STRIPE_WEBHOOK_SECRET` | **yes, if billing is on** | Verifies Stripe events. Without it the webhook refuses to run. |
| `DISCORD_MEMBER_INTENT` | no | `1` subscribes to join/boost events for auto-roles. |
| `RATE_LIMIT_DISABLED` | no | `1` turns the application rate limits off (edge-only deployments). |
| `DATABASE_URL`, `CLOUDINARY_*`, `DISCORD_*`, `STRIPE_SECRET_KEY` | as used | Standard integrations. |

`backend/env.js` runs before anything reads the environment:

- **`JWT_SECRET`**: a real value is kept as entered. The old hard-coded fallback
  (`swats-super-secret-jwt-key-minimum-32-chars-long`) is recognised and
  **refused** — it is in this public repository, so anyone could sign a token for
  any account. In production with no secret, a random per-process secret is
  generated instead: forged tokens are impossible, at the cost of signing
  everyone out on restart. That is a loud `[env] CRITICAL` line, not a surprise.
- Pasted `NAME=value` forms, stray quotes and `<angle brackets>` are cleaned, and
  malformed public URLs are repaired (`publicUrl.js`).

**Set `JWT_SECRET` in the host's env panel.** Pinned by `backend/env.test.js`.

`.env` and friends are gitignored; no secret belongs in the repository or in a
client bundle.

---

## 2. Authentication and sessions

- Passwords are bcrypt-hashed (cost 10) in `routes/auth.js`. Minimum length 6 —
  raise it if you want; there is no policy object yet.
- Session tokens are JWTs, `expiresIn: '7d'`, carrying `sub` and **`tv`**
  (`signToken`, `backend/auth.js`).
- **Revocation**: `tv` is compared against `users.token_version` on every
  authenticated request. A mismatch is a 401 — so `POST /api/me/logout-all`
  (Settings → *Sign out of every device*) invalidates every token ever issued to
  that account, and it is the hook an admin ban should use.
- **Two-factor authentication** (`totp.js`, `twoFactor.js`, `routes/profile.js`,
  Settings UI):
  - TOTP, RFC 6238, SHA-1, 6 digits, 30-second step, ±1 step drift. Implemented
    on `node:crypto` with no dependency, and pinned against the RFC's own vectors
    in `totp.test.js`.
  - Setup is two-step: the secret is stored but the factor stays **off** until a
    code from the authenticator confirms it, so an abandoned setup cannot lock
    someone out.
  - Ten recovery codes, generated once at enable time, stored as **bcrypt
    hashes**, single-use — a used one is deleted before the login completes.
  - Sign-in checks the second factor only *after* the password is known to be
    correct, so the response cannot be used to discover which accounts have 2FA.
  - The secret and the recovery codes are never returned by any endpoint after
    setup; `formatUser` exposes only a boolean.
- **Session transport**: `Authorization: Bearer …` or the `swats_token` cookie
  (`tokenFromRequest`). With `SESSION_COOKIE=1` the token is set as
  `HttpOnly; Secure; SameSite=Lax` (configurable) and left out of the login
  response entirely, so no script on the page can read it — including a
  third-party widget. Cross-host deployments (SPA on Vercel, API on Railway)
  need `SESSION_COOKIE_SAMESITE=none` **and** HTTPS, or the browser will not
  send it; verify a full sign-in/refresh cycle after switching it on.
- Discord OAuth carries the account in a signed `state` token, so a hand-made
  state cannot attach somebody else's Discord identity to your account
  (`userIdFromToken`, `discordLink.test.js`).

---

## 3. Authorization

- Every `/api/me/*`, `/api/admin/*` and `/api/chat/*` route requires a session;
  `/api/admin/*` additionally requires `admin` or owner (`requireAdmin`).
- **Chat**: every thread-scoped route checks membership before acting, wrapped
  keys are written only for accounts already in the thread, and removing a member
  deletes their wrapped key. `chat.authz.test.js` audits the route file itself,
  so a new `/threads/:id/...` route added without `isMember(...)` fails the
  suite. Readings (messages, threads) are free; sending, group creation and
  adding members are Premium (`canSend`).
- **Messages are end-to-end encrypted.** The server stores `{ iv, ciphertext }`
  and nothing else; `chat.test.js` asserts a plaintext body is rejected. Identity
  and conversation keys are generated on the device (`frontend/src/lib/e2ee`);
  the server only ever holds public keys and wrapped copies.
- Admin endpoints are not individually scoped by role (any admin can do anything)
  and there is no admin action log. **Gap.**

---

## 4. Abuse protection

`backend/security.js` (in-memory sliding window) plus `server.js`:

| Scope | Window | Limit |
| --- | --- | --- |
| Global | 60 s | 600 (static uploads and `/api/health` exempt) |
| `/api/auth` | 15 min | 40 |
| `/api/upload` | 60 s | 30 |
| `/api/chat` (non-GET) | 60 s | 60 |

- Client identity prefers `CF-Connecting-IP`, then `X-Forwarded-For`, then the
  socket address.
- The map is bounded (`maxKeys`, LRU eviction) so spoofed-IP floods cannot grow
  it without limit.
- **Gap:** the counters are per process. On Vercel (or any multi-instance deploy)
  each lambda has its own, so the effective limit is `limit × instances`. Move
  the counters to Postgres/Redis if the auth limit has to be real.
- **The edge is the first line of defence**: Cloudflare proxy, WAF managed rules,
  Bot Fight Mode and edge rate-limit rules in front of the origin. The application
  limits above exist for what reaches the origin anyway, and for deployments with
  no proxy. *(The `ANTI_DDOS.md` note that used to describe the edge setup is no
  longer in the tree — restore or rewrite it before relying on it.)*
- Uploads: 25 MB cap, MIME allow-list, files land in Cloudinary rather than on
  the app filesystem (`routes/upload.js`).
- Request bodies: JSON capped at 2 MB, and an oversized/malformed body answers
  JSON instead of Express's HTML error page.

---

## 5. Response hardening

- `securityHeaders()` on every API response: `nosniff`, `Referrer-Policy`,
  `X-DNS-Prefetch-Control: off`, `Permissions-Policy`, HSTS over HTTPS, and a CSP
  carrying `object-src 'none'; base-uri 'self'; form-action 'self'` alongside
  `frame-ancestors` (which allow-lists Discord so the activity embed works,
  instead of `X-Frame-Options`, which cannot express several origins).
- **Private API answers are `Cache-Control: no-store, private`** with
  `Vary: Authorization` (`privateNoStore()`, applied to `/api/me`, `/api/chat`,
  `/api/notifications`, `/api/admin`, `/api/billing`). Without it a shared proxy
  or a mis-set CDN rule can hand one account's `/api/me` to the next visitor.
- **The SPA's Content-Security-Policy** is served by `vercel.json`:
  `script-src 'self'` (no inline scripts anywhere — the one that used to be in
  `public/index.html` moved into `src/index.js` for exactly this reason),
  `style-src 'self' 'unsafe-inline'` (needed by the animation/Radix layers),
  `img/media/connect` limited to `self`, `data:`, `blob:` and `https:`, and the
  same `frame-ancestors` allow-list. **After deploying, check the browser console
  for CSP violations and add the specific origin a widget needs** — a policy that
  breaks a widget is worse than none.
- `x-powered-by` is off.

---

## 6. Payments

`handleStripeWebhook` verifies the signature with `STRIPE_WEBHOOK_SECRET` and
**fails closed**: no secret → 503 (Stripe retries, nothing is applied), missing
or bad signature → 400. It used to fall through to `event = req.body`, i.e. an
unsigned body would have been treated as an event that grants Premium. Pinned by
`billing.webhook.test.js`.

---

## 7. Known gaps, in priority order

1. **No refresh-token rotation.** A 7-day token is valid for 7 days; `tv`
   revocation covers sign-out-everywhere and bans, but there is no short-lived
   access token with rotation, and no per-device session list.
2. **Rate limits are per process** (see §4).
3. **No enforced 2FA for admins**, and no admin action log. The factor exists;
   require it for privileged accounts and record what they do.
4. **`style-src 'unsafe-inline'`** is the weakest directive left in the SPA
   policy. Getting rid of it means auditing Radix/framer-motion inline styles.
5. **Group re-keying on removal.** A removed member loses access at the API, and
   their wrapped key is deleted — but if the conversation key is never rotated,
   re-admitting them restores access to everything said while they were gone. A
   full fix means publishing a fresh conversation key on removal.
6. **No dependency scanning.** `multer@1`, `axios@^1.7` and `express@4` all have
   advisories published since these pins; turn on Dependabot (or `npm audit` in
   CI) and schedule the upgrades.
7. **Email verification and password reset** are not implemented: an account's
   email is trusted as typed.
8. **Password policy is length-only** (6 characters, no breach-list check).

## 8. Testing

```bash
node --test "backend/*.test.js"          # from the repository root
cd frontend && CI=true npx craco test --watchAll=false
```

Security-relevant suites: `security.test.js`, `env.test.js`, `totp.test.js`,
`twoFactor.test.js`, `chat.authz.test.js`, `billing.webhook.test.js`,
`discordBot.test.js`, `discordLink.test.js`.
