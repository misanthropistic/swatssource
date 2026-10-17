import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

// Shared connection-pool tuning. `connectionTimeoutMillis` matters most: without
// it a host that accepts the TCP connection but never answers leaves
// pool.connect() pending indefinitely, and because the request gate in server.js
// awaits the pool, the whole API hangs with it.
const POOL_DEFAULTS = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const createPoolConfig = () => {
  if (dbUrl) {
    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    return {
      ...POOL_DEFAULTS,
      connectionString: dbUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };
  }
  if (process.env.PGHOST) {
    const isLocal = process.env.PGHOST.includes('localhost') || process.env.PGHOST.includes('127.0.0.1');
    return {
      ...POOL_DEFAULTS,
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
      user: process.env.PGUSER || process.env.POSTGRES_USER,
      password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
      database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway',
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };
  }
  return {
    ...POOL_DEFAULTS,
    connectionString: 'postgresql://postgres:postgres@localhost:5432/swats',
    ssl: false,
  };
};

const pool = new Pool(createPoolConfig());

export const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      throw new Error(`Database connection failed (${err.message}). Make sure DATABASE_URL, DATABASE_PUBLIC_URL or Railway PG variables are set on your deployment.`);
    }
    throw err;
  }
};

/* A profile's UID is shown to visitors as a plain number, not the raw UUID, so
   people can tell an early account from a new one at a glance. There is no
   serial column (users are keyed by UUID), so the number is the account's 1-based
   rank by signup time. The (created_at, id) tuple keeps ties deterministic, and
   idx_users_created_at makes the count cheap. */
export async function memberNumber(userId, createdAt) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM users WHERE (created_at, id) <= ($1, $2)',
    [createdAt, userId],
  );
  return rows[0]?.n || 1;
}

export async function initDb() {
  console.log('Initializing PostgreSQL database schema...');

  // Connect OUTSIDE the schema try/catch on purpose: a failure here means the
  // database is unreachable, which the caller needs to know about so it can back
  // off. Schema errors below are logged but tolerated (the tables may already
  // exist from a previous run).
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    throw err;
  }

  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'user',
        tier TEXT DEFAULT 'free',
        is_owner BOOLEAN DEFAULT FALSE,
        views INTEGER DEFAULT 0,
        badges TEXT[] DEFAULT '{}',
        equipped_badges TEXT[] DEFAULT '{}',
        custom_badges JSONB DEFAULT '[]',
        discord JSONB DEFAULT '{"linked": false, "id": null, "username": null, "avatar": null, "booster": false, "member": false}',
        profile JSONB DEFAULT '{}',
        invite_code_used TEXT,
        last_username_change TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_username_change TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_badges JSONB DEFAULT '[]';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_badges TEXT[] DEFAULT '{}';
      -- Per-user third-party API keys (Riot / YouTube / GitHub) used only by the
      -- widget proxy. Never returned to any client. See routes/integrations.js.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT '{}';

      -- Two-factor authentication (see totp.js + twoFactor.js). The secret is
      -- written when setup starts and only trusted once a code from the
      -- authenticator has confirmed it; recovery codes are stored as bcrypt
      -- hashes, exactly like passwords.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery JSONB DEFAULT '[]';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;

      -- Session revocation. Every token carries this number and stops being
      -- accepted the moment it changes, which is what makes "sign out of every
      -- device" (and an admin ban) mean something for a 7-day JWT.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS donated_cents INTEGER NOT NULL DEFAULT 0;
      -- Multi-account switching: the accounts this one can swap to from the
      -- dashboard's account menu. Mutually linked pairs only — see the
      -- /auth/link-account and /auth/switch routes.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_accounts JSONB DEFAULT '[]';

      -- The audit trail (see auditLog.js). One row per thing that happened:
      -- admin mutations, sign-ins, account pairings, automatic rewards. The
      -- actor column is SET NULL rather than CASCADE so deleting an account
      -- never deletes the history of what that account did.
      CREATE TABLE IF NOT EXISTS audit_events (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_username TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        detail JSONB NOT NULL DEFAULT '{}',
        ip TEXT,
        user_agent TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
      CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_username);
      CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events (target_type, target_id);

      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
        storage_url TEXT NOT NULL,
        original_filename TEXT,
        content_type TEXT,
        size INTEGER,
        metadata JSONB DEFAULT '{}',
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Dimension/format metadata arrived after the table, hence IF NOT EXISTS.
      ALTER TABLE files ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        uses INTEGER DEFAULT 0,
        max_uses INTEGER DEFAULT 1,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- An admin can make a code hand out a paid tier. Added after the table
      -- shipped, so it is a separate ALTER: CREATE TABLE IF NOT EXISTS silently
      -- does nothing on an existing database and the column would never appear.
      ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS grants_tier TEXT;
      -- A code can also hand out a TIMED trial: premium_days = how many days.
      -- NULL means the code grants the tier permanently (or nothing).
      ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS premium_days INTEGER;
      -- …and badges. grants_badges is the list of badge ids the code hands
      -- out to whoever redeems it (at sign-up or later from the dashboard),
      -- so an invite can be a way to hand out Verified / Media / OG without an
      -- admin editing each account by hand. Validated against the badge
      -- catalog on write; see sanitizeBadgeGrants in badges.js.
      ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS grants_badges TEXT[] DEFAULT '{}';
      -- Timed premium (trials from invite codes and view-reward milestones)
      -- needs an expiry on the account itself; the tier flips back to free
      -- lazily on the next authenticated request past the deadline.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;
      -- Which view milestones THIS account has already been paid for, so a
      -- milestone crossed again (deleted-count edge cases) cannot pay twice.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS rewarded_milestones INTEGER[] DEFAULT '{}';

      CREATE TABLE IF NOT EXISTS custom_badges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        icon_url TEXT,
        glow_color TEXT DEFAULT '#A48DF4',
        glow_intensity INTEGER DEFAULT 50,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS community_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        author_username TEXT NOT NULL,
        author_avatar TEXT,
        background_preview TEXT,
        config JSONB NOT NULL,
        downloads_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );

      -- Profile view system (see backend/views.js + routes/views.js).
      -- A row exists only when a dwelled, proof-of-work-verified visitor looked
      -- at a profile. The bucket column is the 12h window, so the unique index
      -- below makes duplicate counts impossible even under concurrent requests.
      CREATE TABLE IF NOT EXISTS profile_views (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        visitor_hash TEXT NOT NULL,
        bucket BIGINT NOT NULL,
        viewed_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Short-lived, single-use challenges issued before a view is registered.
      CREATE TABLE IF NOT EXISTS view_challenges (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        visitor_hash TEXT NOT NULL,
        seed TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- The IP-free twin of visitor_hash. A visitor whose address changed between
      -- the challenge and the register (mobile network, proxy pool) is still the
      -- same visit, and the register accepts either key. Added after the table
      -- shipped, so it is a separate ALTER for databases that already have it.
      ALTER TABLE view_challenges ADD COLUMN IF NOT EXISTS visitor_hash_loose TEXT;

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_views ON users(views DESC);
      CREATE INDEX IF NOT EXISTS idx_templates_creator ON community_templates(creator_id);

      -- Every lookup in the app (public profile, login, username availability,
      -- the admin search) filters on LOWER(username)/LOWER(email). A plain btree
      -- index on the raw column cannot serve those, so each one was a full
      -- sequential scan of users. These expression indexes are the ones the
      -- planner can actually use.
      CREATE INDEX IF NOT EXISTS idx_users_lower_username ON users (LOWER(username));
      CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_templates_downloads ON community_templates(downloads_count DESC, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_views_unique ON profile_views (user_id, visitor_hash, bucket);
      CREATE INDEX IF NOT EXISTS idx_profile_views_user ON profile_views (user_id, viewed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_view_challenges_expires ON view_challenges (expires_at);

      -- In-app inbox + the "ping" the dashboard bell polls. One row per
      -- recipient, so read state and deletion stay per-user, and batch_id
      -- groups the rows one send created (that is what the admin history shows).
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        batch_id UUID,
        kind TEXT NOT NULL DEFAULT 'system',
        title TEXT NOT NULL,
        body TEXT,
        href TEXT,
        source_id UUID,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_batch ON notifications (batch_id);

      -- Admin devlog posts. Publishing one can fan out an inbox notification to
      -- everyone or to a hand-picked list (see routes/notifications.js).
      CREATE TABLE IF NOT EXISTS devlogs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        author_username TEXT,
        title TEXT NOT NULL,
        body TEXT,
        tag TEXT,
        -- Which devlog a post belongs to. 'public' is the changelog on the site
        -- (and its own tab in the top nav); 'dashboard' is the build log the
        -- signed-in dashboard reads. Defaulted to public so every post written
        -- before the two feeds existed keeps showing exactly where it did.
        channel TEXT DEFAULT 'public',
        pinned BOOLEAN DEFAULT FALSE,
        published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_devlogs_created ON devlogs (pinned DESC, created_at DESC);

      ALTER TABLE devlogs ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'public';
      UPDATE devlogs SET channel = 'public' WHERE channel IS NULL;

      -- Scheduled, audience-targeted banners. Supersedes the single
      -- site_settings.announcement string, which is still read as a fallback so
      -- an announcement written before this table existed keeps showing.
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        href TEXT,
        href_label TEXT,
        audience TEXT DEFAULT 'all',
        active BOOLEAN DEFAULT TRUE,
        starts_at TIMESTAMPTZ DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_announcements_live ON announcements (active, starts_at DESC);
    `);

    /* -----------------------------------------------------------------------
       Messages (see routes/chat.js)

       A message is ordinary text stored on the server (chat_messages.body). The
       old end-to-end layer — browser-held identity keys, per-thread wrapped
       AES keys — is retired: too many members could not open their own
       conversations. The pieces now are just:

         friendships        the social graph. Free and Premium alike may be
                            friends; talking is what Premium buys.
         chat_threads       one row per conversation, direct or group.
         chat_members       who is in it, and how far they have read.
         chat_messages      the text, in order.

       Chat is deliberately separate from `notifications`: a notification is
       server-written copy the bell and the admin tools read, and it is the
       pointer to a message, never a copy of one.
       ----------------------------------------------------------------------- */
    await client.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        CHECK (requester_id <> addressee_id)
      );

      -- One row per pair, in either direction, so A→B and B→A can never both
      -- exist (which would show the same person twice in each other's list).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
        ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
      CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);
      CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);

      CREATE TABLE IF NOT EXISTS chat_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kind TEXT NOT NULL DEFAULT 'direct',
        title TEXT,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        direct_key TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- The sorted pair for a 1:1 thread, so asking for the same conversation
      -- twice returns the one that already exists instead of a second empty one.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_direct
        ON chat_threads (direct_key) WHERE direct_key IS NOT NULL;

      -- Group icon: the picture a group chats under, picked by its members
      -- (settings live on /api/chat/threads/:id). Added later than the table,
      -- hence IF NOT EXISTS.
      ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS icon TEXT;

      CREATE TABLE IF NOT EXISTS chat_members (
        thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        last_read_at TIMESTAMPTZ,
        PRIMARY KEY (thread_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members (user_id, joined_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- The end-to-end era's ciphertext columns and the key tables are retired
      -- for good: the idempotent migrations below strip them so a database that
      -- lived through that era comes out the same shape as a fresh one.
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS body TEXT;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='iv') THEN
          ALTER TABLE chat_messages ALTER COLUMN iv DROP NOT NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='ciphertext') THEN
          ALTER TABLE chat_messages ALTER COLUMN ciphertext DROP NOT NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='alg') THEN
          ALTER TABLE chat_messages ALTER COLUMN alg DROP NOT NULL;
        END IF;
      END $$;
      -- A message that only ever existed as ciphertext (no plaintext row was
      -- ever written for it) has no body to show anybody. The text the old
      -- system could not show is honestly unrecoverable.
      DROP TABLE IF EXISTS chat_thread_keys;
      DROP TABLE IF EXISTS chat_keys;

      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, created_at DESC);

      /* ----------------------------------------------------------------------
         The public rooms

         "General" is readable by anyone with a Premium account and stored as
         plain text. It lives in its OWN table rather than as a flag on
         chat_messages, because the promise that table makes — a row is an
         AES-GCM ciphertext and the database cannot read it — must not depend on
         a column a future code path could get wrong. A separate table makes it
         impossible for a plaintext body to land in the encrypted one: the
         columns are not there.

         attachment_url is a picture or GIF already uploaded through
         /api/upload. It is only ever written for a public room; a room whose
         messages are encrypted keeps to text, because an image stored in the
         clear would end the promise the ciphertext is making.
         ---------------------------------------------------------------------- */
      CREATE TABLE IF NOT EXISTS global_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room TEXT NOT NULL,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        attachment_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      /* An admin's correction to a public message. Kept as columns rather than
         as a row per revision: the edit is a fact about the message (it says
         "edited" and by whom), and the room does not need the history of a
         text everybody already read. Both are added later than the table,
         hence IF NOT EXISTS. */
      ALTER TABLE global_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
      ALTER TABLE global_messages ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_global_messages_room ON global_messages (room, created_at DESC);

      /* A silenced member of a room. "Banned" means they may keep reading and
         may not post, and it is reversible from the same panel — so it is one
         row per (room, person) rather than a flag on the account, and it names
         who did it and why. */
      CREATE TABLE IF NOT EXISTS chat_bans (
        room TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT,
        by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (room, user_id)
      );
    `);

    // Seed default site settings if missing
    await client.query(`
      INSERT INTO site_settings (key, value)
      VALUES ('general', '{"registration_open": true, "maintenance_mode": false, "announcement": "", "invite_only": false, "auth_required_to_edit": false, "discord_required": false}')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Seed admin if ADMIN_EMAIL & ADMIN_PASSWORD provided
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail.toLowerCase()]);
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 10);
        await client.query(`
          INSERT INTO users (email, password_hash, username, display_name, role, tier, is_owner, badges, profile)
          VALUES ($1, $2, 'swats', 'Owner', 'admin', 'admin', true, ARRAY['og','owner','admin','team','verified','premium'], $3)
        `, [
          adminEmail.toLowerCase(),
          hash,
          JSON.stringify({
            bio: 'Official swats.bio administrator',
            theme_color: '#A48DF4',
            accent_color: '#D3C4FF',
            name_font: 'Unbounded',
            display_font: 'Unbounded',
            bio_font: 'Inter',
            layout: 'floating',
            card_style: 'aurora',
            links: [{ platform: 'discord', label: 'Discord', url: 'https://discord.gg/a9uwptuepD', mode: 'card' }],
          })
        ]);
        console.log(`Seeded owner/admin account for ${adminEmail}`);
      }
    }

    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database schema initialization error:', err);
  } finally {
    client.release();
  }
}

export default pool;
