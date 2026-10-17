// Run with: node --test backend/devlogs.channel.test.js
//
// Two devlogs, two audiences: the public changelog at /!/devlogs and the
// dashboard build log at /!/dashboard/devlogs. Both read the same table, so the
// only thing keeping them apart is the `channel` value — which means the
// reader's filter, the writer's normalisation and the legacy-row fallback all
// have to agree. A reader that forgets the filter shows build notes to visitors;
// a writer that stores an unknown channel hides a post from both feeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEVLOG_CHANNELS } from './routes/notifications.js';

const reader = readFileSync(new URL('./routes/notifications.js', import.meta.url), 'utf8');
const writer = readFileSync(new URL('./routes/admin.js', import.meta.url), 'utf8');

test('there are exactly two devlog channels, and public is the default', () => {
  assert.deepEqual(DEVLOG_CHANNELS, ['public', 'dashboard']);
});

test('the reader filters by channel and keeps pre-channel rows on the public feed', () => {
  // COALESCE, not `channel = $1`: rows written before the column existed are
  // NULL, and a plain comparison would drop every one of them out of both feeds.
  assert.match(reader, /COALESCE\(channel, 'public'\) = \$1/);
  // An unknown ?channel= falls back to public rather than emptying the feed.
  assert.match(reader, /DEVLOG_CHANNELS\.includes\(requested\) \? requested : 'public'/);
});

test('the writer stores a channel, and only a known one', () => {
  assert.match(writer, /INSERT INTO devlogs \([^)]*channel[^)]*\)/);
  assert.match(writer, /DEVLOG_CHANNELS\.includes\(String\(channel\)\) \? String\(channel\) : 'public'/);
  // Editing keeps the post where it is when a bad channel is sent.
  assert.match(writer, /DEVLOG_CHANNELS\.includes\(String\(channel\)\) \? String\(channel\) : \(current\.channel \|\| 'public'\)/);
});

test('a dashboard post notifies with a link to the dashboard feed', () => {
  assert.match(writer, /cleanChannel === 'dashboard' \? '\/!\/dashboard\/devlogs' : '\/!\/devlogs'/);
});

test('the migration backfills existing posts onto the public changelog', () => {
  const db = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
  assert.match(db, /ALTER TABLE devlogs ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'public'/);
  assert.match(db, /UPDATE devlogs SET channel = 'public' WHERE channel IS NULL/);
});
