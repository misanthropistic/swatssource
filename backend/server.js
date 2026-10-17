import './env.js'; // must be first: sanitizes env before libraries read it
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import uploadRouter from './routes/upload.js';
import publicRouter from './routes/public.js';
import billingRouter, { handleStripeWebhook } from './routes/billing.js';
import adminRouter from './routes/admin.js';
import integrationsRouter from './routes/integrations.js';
import widgetsRouter from './routes/widgets.js';
import templatesRouter from './routes/templates.js';
import viewsRouter from './routes/views.js';
import notificationsRouter from './routes/notifications.js';
import downloadRouter from './routes/download.js';
import { rateLimit, securityHeaders, privateNoStore, PRIVATE_API_PREFIXES } from './security.js';
import { startBotPresence, stopBotPresence } from './discordBot.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
// Express advertises itself by default, which is free reconnaissance.
app.disable('x-powered-by');
const PORT = process.env.PORT || 5000;

// CORS setup
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  // Requests without an Origin header (curl, native apps) are fine — it is the
  // browser's same-origin policy being tested against the header, and browsers
  // always send one with credentials. A request that claims one of OUR origins
  // is allowed; anything else is other people's sites trying to ride the user's
  // cookies, and answering `false` is the whole point of having a list.
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Any localhost port during development, never in production rows.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
}));

// Baseline hardening headers on every response. The API answers opt into
// frame-ancestors instead of X-Frame-Options so Discord can embed swats.bio
// inside its activity iframe (see FRAME_ANCESTORS_ORIGIN_PATTERNS) without
// weakening anything else: every origin that has not been allow-listed stays
// framed out.
app.use(securityHeaders({ frameAncestors: true }));

// Global ceiling: one client cannot make the API a free stress test. Static
// uploads and the health probe are exempt so a normal profile page load (many
// cached asset requests) is never the thing that trips the limit. This sits in
// FRONT of the Cloudflare edge rules documented in ANTI_DDOS.md, not instead of
// them; RATE_LIMIT_DISABLED=1 turns it off if an edge-only setup is preferred.
app.use(rateLimit({
  scope: 'global',
  windowMs: 60_000,
  max: 600,
  message: 'Too many requests from this client. Slow down.',
  skip: (req) =>
    req.method === 'GET' && (req.path.startsWith('/api/uploads') || req.path === '/api/health'),
}));

// Personal and privileged answers are never cacheable. Registered before the
// routes so it also covers an error response, and it is the reason a shared
// proxy cannot serve one account's /api/me to the next visitor.
app.use(PRIVATE_API_PREFIXES, privateNoStore());

// Credential endpoints are where stuffing/brute-force actually pays off, so they
// get a much tighter window than the rest of the API.
app.use('/api/auth', rateLimit({
  scope: 'auth',
  windowMs: 15 * 60_000,
  max: 40,
  message: 'Too many authentication attempts. Try again later.',
}));

// Uploads are the most expensive request to serve (multer + Cloudinary).
app.use('/api/upload', rateLimit({
  scope: 'upload',
  windowMs: 60_000,
  max: 30,
  message: 'Too many uploads. Slow down.',
}));

// Stripe webhook needs raw body
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Lazily initialize the DB schema once per process (works for serverless cold
// starts too).
//
// When the database is unreachable the previous code set `dbReady = null` after
// every failure, so EVERY incoming request re-ran initDb() and blocked on a
// fresh connection attempt. While the DB was down the API did not fail fast, it
// queued up and got slower the more traffic arrived. Failures now back off.
let dbReady = null;
let dbRetryAfter = 0;
const DB_RETRY_BACKOFF_MS = 15000;

app.use((req, res, next) => {
  const proceed = () => next();

  if (dbReady) return dbReady.then(proceed, proceed);
  if (Date.now() < dbRetryAfter) return proceed();

  dbReady = initDb().catch((err) => {
    console.error('DB init failed:', err.message);
    dbReady = null;
    dbRetryAfter = Date.now() + DB_RETRY_BACKOFF_MS;
  });
  return dbReady.then(proceed, proceed);
});

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Body parser for JSON. 50mb was both unnecessary (profile/template payloads are
// small) and a memory-amplification lever: a handful of concurrent oversized
// bodies could pin the event loop. File uploads do not pass through here — they
// go to multer on the /api/upload route, which keeps its own size cap.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve local uploads through the /api proxy path
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount all API routes under /api
app.use('/api/auth', authRouter);
app.use('/api/me', profileRouter);
app.use('/api/upload', uploadRouter);
app.use('/api', publicRouter);
app.use('/', publicRouter);
app.use('/api/billing', billingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/templates', templatesRouter);
app.use('/api', integrationsRouter);
// Profile views: proof-of-work challenge + registration (see routes/views.js).
app.use('/api', viewsRouter);
// Inbox notifications, public announcements and devlog posts.
app.use('/api', notificationsRouter);
// Live widget data: real third-party API proxies (Roblox, Discord, GitHub, ...)
app.use('/api/widgets', widgetsRouter);
// Full source download ("Download Site" button on the homepage).
app.use('/api', downloadRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Root ping
app.get('/', (req, res) => {
  res.send('swats.bio API is running.');
});

// Unmatched /api/* routes must answer JSON, not the index.html fallback.
app.use('/api', (req, res) => {
  res.status(404).json({ detail: `No API route for ${req.method} ${req.originalUrl}` });
});

// JSON error handler — MUST be the last middleware registered.
// Without it, anything thrown inside a middleware (multer's size/field limits,
// malformed multipart or JSON bodies) fell through to Express's default error
// page, which is HTML. The SPA's API client turns HTML into "API route returned
// HTML page instead of JSON backend response", so a too-large upload showed up
// as a routing error with no hint about the real cause.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const code = err?.code || '';

  if (err?.name === 'MulterError') {
    const detail =
      code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. The maximum upload size is 25MB.'
        : code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field. Send the attachment as the "file" form field.'
          : `Upload rejected (${code || 'invalid multipart body'}).`;
    console.warn('Upload middleware rejected:', code, err.message);
    return res.status(code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ detail });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ detail: 'Request body is too large.' });
  }

  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ detail: 'Request body is not valid JSON.' });
  }

  console.error('Unhandled request error:', err);
  const status = err?.status || err?.statusCode || 500;
  return res.status(status).json({ detail: err?.message || 'Internal server error' });
});

// Start server locally; on Vercel the exported app is used as the handler
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`swats.bio API server running on port ${PORT}`);
    // The gateway presence connection lives with the long-running server, not
    // with a serverless handler: Discord drops cold-start sockets and the bot
    // would blink offline on every deploy.
    startBotPresence();
  });

  process.on('SIGTERM', () => {
    stopBotPresence();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    stopBotPresence();
    process.exit(0);
  });
}

export default app;
