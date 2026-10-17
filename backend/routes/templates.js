import express from 'express';
import { query } from '../db.js';
import { requireAuth, formatUser } from '../auth.js';
import { LAYOUTS } from './profile.js';

const router = express.Router();

/* What a visitor can choose to take from a template.

   Applying a template used to copy the whole profile, so a stranger's avatar,
   audio track and Discord account tags landed on your page whether you wanted
   them or not. These groups let the apply step say which parts are welcome; the
   labels live in the dashboard (Templates.jsx) and the patterns live here, next
   to the profile keys they have to match.

   Anything that matches no group is treated as `theme`, so a profile field added
   later still travels with the template instead of being silently dropped. */
const PROFILE_GROUPS = [
  ['avatar', /^avatar_(url|decoration)$/],
  ['audio', /^audio_/],
  ['tracks', /^tracks$/],
  ['links', /^links$/],
  ['widgets', /^widgets$/],
  ['background', /^(background_|banner_|bg_)/],
  ['effects', /(effect|overlay|cursor_effect|custom_|advanced_mode|crosshair_|cursor_)/],
  ['text', /^(bio|display_name|location|entry_|alias_color|showcase_uid)/],
];

const DEFAULT_STARTER_TEMPLATES = [
  {
    title: 'Cyberpunk 2099',
    description: 'Futuristic neon aesthetics with cyan accents, scanlines, and high-tech typography.',
    author_username: 'swats',
    background_preview: '#00f0ff',
    config: {
      theme_color: '#00f0ff',
      accent_color: '#ff0055',
      name_font: 'Unbounded',
      bio_font: 'JetBrains Mono',
      display_font: 'Unbounded',
      layout: 'default',
      card_style: 'cyber',
      card_opacity: 90,
      card_blur: 16,
      background_color: '#050811',
      background_effect: 'cyber_grid',
      overlay: 'scanlines',
      overlay_opacity: 30,
      entry_style: 'terminal',
      entry_text: 'INITIALIZE_NEURAL_LINK',
      display_name: 'CYBER//RUNNER',
      bio: '⚡ Augmented reality architect • Neo-Tokyo netrunner\n[Status: ONLINE]'
    }
  },
  {
    title: 'Y2K Bubblegum',
    description: 'Retro 2000s aesthetic with frosted pink glass, sparkles, and bouncy cute typography.',
    author_username: 'swats',
    background_preview: '#FF7FBC',
    config: {
      theme_color: '#FF7FBC',
      accent_color: '#FFB8DB',
      name_font: 'Outfit',
      bio_font: 'Poppins',
      display_font: 'Outfit',
      layout: 'floating',
      card_style: 'frosted',
      card_opacity: 75,
      card_blur: 24,
      background_color: '#12050c',
      background_effect: 'sparkles',
      overlay: 'sparkles',
      overlay_opacity: 40,
      entry_style: 'bubble',
      entry_text: '✧ enter dreamworld ✧',
      display_name: 'angelic.exe',
      bio: '★ y2k archivist • digital fairy • listen to my playlist below ♡'
    }
  },
  {
    title: 'Midnight Phantom',
    description: 'Deep monochrome obsidian with gothic serif typography, smoke overlay, and velvet purple glow.',
    author_username: 'swats',
    background_preview: '#3b0764',
    config: {
      theme_color: '#8b5cf6',
      accent_color: '#a855f7',
      name_font: 'Playfair Display',
      bio_font: 'Lora',
      display_font: 'Playfair Display',
      layout: 'minimal',
      card_style: 'glass',
      card_opacity: 85,
      card_blur: 20,
      background_color: '#07040a',
      background_effect: 'smoke',
      overlay: 'vhs',
      overlay_opacity: 25,
      entry_style: 'text',
      entry_text: '[ Click into the dark ]',
      display_name: 'Phantom',
      bio: 'Walking in the shadows. Night owl & music composer.'
    }
  },
  {
    title: 'Vaporwave Sunset',
    description: '80s retro synthwave gradient, warm sunset hues, nostalgic scanline overlay.',
    author_username: 'swats',
    background_preview: '#f97316',
    config: {
      theme_color: '#f97316',
      accent_color: '#ec4899',
      name_font: 'Space Grotesk',
      bio_font: 'Inter',
      display_font: 'Space Grotesk',
      layout: 'default',
      card_style: 'aurora',
      card_opacity: 80,
      background_color: '#0a0512',
      overlay: 'scanlines',
      overlay_opacity: 35,
      entry_style: 'pulse',
      entry_text: '▶ PRESS TO PLAY 1984',
      display_name: 'SYNTH // WAVE',
      bio: 'Late night drives on neon highways. Tape decks and synthesizers.'
    }
  },
  {
    title: 'Minimalist Monochrome',
    description: 'Ultra-clean black and white design with high-fashion typography, borderless frosted glass.',
    author_username: 'swats',
    background_preview: '#18181b',
    config: {
      theme_color: '#ffffff',
      accent_color: '#e4e4e7',
      name_font: 'Inter',
      bio_font: 'Inter',
      display_font: 'Inter',
      layout: 'minimal',
      card_style: 'frosted',
      card_opacity: 60,
      card_blur: 30,
      background_color: '#000000',
      entry_style: 'text',
      entry_text: 'ENTER',
      display_name: 'STUDIO / DESIGN',
      bio: 'Less is more. Digital minimalism & product craft.'
    }
  },
  {
    title: 'Neo Acid Matrix',
    description: 'Raw acid green hacker terminal aesthetic with code lock gate and digital rain.',
    author_username: 'swats',
    background_preview: '#15803d',
    config: {
      theme_color: '#22c55e',
      accent_color: '#4ade80',
      name_font: 'JetBrains Mono',
      bio_font: 'JetBrains Mono',
      display_font: 'JetBrains Mono',
      layout: 'default',
      card_style: 'cyber',
      card_opacity: 92,
      card_blur: 12,
      background_color: '#020a04',
      overlay: 'dotters',
      overlay_opacity: 40,
      entry_style: 'codelock',
      entry_text: '1337',
      display_name: 'ROOT@MAINFRAME',
      bio: '$ chmod +x identity\n$ ./explore --stealth'
    }
  }
];

const NEVER_COPIED = ['links', 'widgets'];

export const TEMPLATE_NEVER_COPIED = NEVER_COPIED;

export const TEMPLATE_GROUPS = PROFILE_GROUPS.map(([name]) => name)
  .filter((name) => !NEVER_COPIED.includes(name))
  .concat('theme');

export const ALL_PROFILE_GROUPS = PROFILE_GROUPS.map(([name]) => name).concat('theme');

export function stripNeverCopied(config) {
  const source = config && typeof config === 'object' ? config : {};
  const kept = {};
  for (const [key, value] of Object.entries(source)) {
    if (NEVER_COPIED.includes(groupForProfileKey(key))) continue;
    kept[key] = value;
  }
  return kept;
}

export const FREE_FONTS = [
  'Bebas Neue', 'Courier New', 'Georgia', 'Inter', 'JetBrains Mono', 'Lora',
  'Montserrat', 'Oswald', 'Outfit', 'Playfair Display', 'Poppins', 'Space Grotesk',
  'Syne', 'Unbounded', 'system-ui',
];

export const FREE_TRACK_STYLES = ['', 'mini-bar', 'compact', 'corner-icon'];

const PREMIUM_VALUE_KEYS = /^(name_effect|bio_effect|avatar_effect|overlay|background_effect|cursor_effect|crosshair_image|crosshair_scale|crosshair_x|crosshair_y|custom_css|custom_html)$/;

export function templateTier(config) {
  const c = config && typeof config === 'object' ? config : {};

  if (LAYOUTS.premium.includes(c.layout)) return 'premium';
  for (const [key, value] of Object.entries(c)) {
    if (PREMIUM_VALUE_KEYS.test(key) && typeof value === 'string' && value.trim()) return 'premium';
  }
  if (c.track_style && !FREE_TRACK_STYLES.includes(c.track_style)) return 'premium';
  for (const key of ['display_font', 'name_font', 'bio_font']) {
    const font = c[key];
    if (font && !FREE_FONTS.includes(font)) return 'premium';
  }
  return 'free';
}

export const TEMPLATE_LIMITS = { free: 3, premium: 10 };

export function templateLimitFor(user) {
  const unlimited = user?.is_owner || user?.role === 'admin' || user?.tier === 'admin';
  const premium =
    user?.tier === 'premium' || user?.tier === 'admin' || user?.role === 'admin' || !!user?.is_owner;
  return {
    premium,
    unlimited,
    limit: unlimited ? null : premium ? TEMPLATE_LIMITS.premium : TEMPLATE_LIMITS.free,
  };
}

export function groupForProfileKey(key) {
  const match = PROFILE_GROUPS.find(([, pattern]) => pattern.test(key));
  return match ? match[0] : 'theme';
}

export function filterTemplateConfig(config, include) {
  const source = config && typeof config === 'object' ? config : {};

  const kept = {};
  for (const [key, value] of Object.entries(source)) {
    const group = groupForProfileKey(key);
    if (NEVER_COPIED.includes(group)) continue;
    if (!include || typeof include !== 'object') {
      kept[key] = value;
      continue;
    }
    if (!(group in include) || include[group]) kept[key] = value;
  }
  return kept;
}

// GET /api/templates - list all community templates
router.get('/', async (req, res) => {
  try {
    let { rows } = await query(`
      SELECT 
        t.id, t.title, t.description, t.author_username, t.author_avatar,
        t.background_preview, t.config, t.downloads_count, t.created_at,
        t.creator_id
      FROM community_templates t
      ORDER BY t.downloads_count DESC, t.created_at DESC
      LIMIT 50
    `);

    // If empty, auto-seed default starter templates
    if (rows.length === 0) {
      for (const t of DEFAULT_STARTER_TEMPLATES) {
        try {
          await query(
            `INSERT INTO community_templates (creator_id, title, description, author_username, background_preview, config, downloads_count)
             VALUES (NULL, $1, $2, $3, $4, $5, 12)`,
            [t.title, t.description, t.author_username, t.background_preview, JSON.stringify(t.config)]
          );
        } catch {
          // Ignore unique / conflict errors during concurrent seed
        }
      }
      const refetched = await query(`
        SELECT 
          t.id, t.title, t.description, t.author_username, t.author_avatar,
          t.background_preview, t.config, t.downloads_count, t.created_at,
          t.creator_id
        FROM community_templates t
        ORDER BY t.downloads_count DESC, t.created_at DESC
        LIMIT 50
      `);
      rows = refetched.rows;
    }

    return res.json(rows.map((row) => ({
      ...row,
      config: stripNeverCopied(row.config),
      tier: templateTier(row.config),
    })));
  } catch (err) {
    console.error('Fetch templates error:', err);
    return res.status(500).json({ detail: 'Failed to fetch community templates' });
  }
});

// POST /api/templates - publish current user profile as a template
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ detail: 'Template title is required' });
    }

    const { premium: isPremium, limit } = templateLimitFor(req.user);

    const countRes = await query('SELECT COUNT(*) FROM community_templates WHERE creator_id = $1', [req.user.id]);
    const currentCount = parseInt(countRes.rows[0].count, 10);

    if (limit !== null && currentCount >= limit) {
      return res.status(403).json({
        // Say what the limit IS and that the slot is used, rather than only
        // what upgrading would buy: the reader's next question is "how many do
        // I have already?"
        detail: isPremium
          ? `You have published all ${limit} of your Premium template slots. Delete one to publish another.`
          : `You have used all ${limit} of your free template slots (${currentCount}/${limit}). Delete one to publish another, or upgrade for ${TEMPLATE_LIMITS.premium}.`,
        limit,
        count: currentCount,
        code: 'template_limit_reached',
      });
    }

    const profile = req.user.profile || {};
    const bgPreview = profile.background_url || profile.banner_url || profile.avatar_url || profile.theme_color || '#FF7FBC';
    const authorAvatar = profile.avatar_url || null;

    // What gets stored is the look only: the author's own links and widgets stay
    // on the author's page.
    const stored = stripNeverCopied(profile);

    const { rows } = await query(`
      INSERT INTO community_templates (creator_id, title, description, author_username, author_avatar, background_preview, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      req.user.id,
      title.trim().slice(0, 50),
      (description || '').trim().slice(0, 200),
      req.user.username,
      authorAvatar,
      bgPreview,
      JSON.stringify(stored)
    ]);

    return res.json({ ...rows[0], config: stored, tier: templateTier(stored) });
  } catch (err) {
    console.error('Create template error:', err);
    return res.status(500).json({ detail: 'Failed to publish community template' });
  }
});

/* GET /api/templates/mine

   What this account has published, and the slot count the publish form shows.
   The count has to come from here rather than from the marketplace page: that
   page is ordered by downloads and capped, so an author whose template had slid
   off it would be told they had published nothing and would try again — and be
   refused by the limit they could not see. */
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { premium, unlimited, limit } = templateLimitFor(req.user);
    const { rows } = await query(
      'SELECT * FROM community_templates WHERE creator_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    return res.json({
      count: rows.length,
      limit,
      unlimited,
      premium,
      templates: rows.map((row) => ({
        ...row,
        config: stripNeverCopied(row.config),
        tier: templateTier(row.config),
      })),
    });
  } catch (err) {
    console.error('Fetch own templates error:', err);
    return res.status(500).json({ detail: 'Failed to fetch your templates' });
  }
});

/* PATCH /api/templates/:id

   Rename or re-describe something you published. The profile blob is not
   touched here: a template's look is a snapshot, and letting an author rewrite
   it in place would silently change what everyone who already applied it is
   wearing. Only the author (or an admin) may do this, the same rule DELETE
   already used. */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === 'admin' || req.user.is_owner;

    const check = await query('SELECT creator_id FROM community_templates WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ detail: 'Template not found' });
    }
    if (check.rows[0].creator_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ detail: 'This template is not yours to edit' });
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 50) : null;
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 200) : null;

    if (title !== null && !title) {
      return res.status(400).json({ detail: 'Template title cannot be empty' });
    }

    const { rows } = await query(
      `UPDATE community_templates
         SET title = COALESCE($1, title), description = COALESCE($2, description)
       WHERE id = $3
       RETURNING *`,
      [title, description, id]
    );

    return res.json({
      ...rows[0],
      config: stripNeverCopied(rows[0].config),
      tier: templateTier(rows[0].config),
    });
  } catch (err) {
    console.error('Update template error:', err);
    return res.status(500).json({ detail: 'Failed to update the template' });
  }
});

// POST /api/templates/:id/apply - apply template to user profile
router.post('/:id/apply', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const templateRes = await query('SELECT * FROM community_templates WHERE id = $1', [id]);
    if (templateRes.rows.length === 0) {
      return res.status(404).json({ detail: 'Template not found' });
    }

    const template = templateRes.rows[0];
    const templateConfig = template.config || {};
    const tier = templateTier(templateConfig);
    const isPremium = req.user.tier === 'premium' || req.user.tier === 'admin' || req.user.role === 'admin' || req.user.is_owner;

    if (tier === 'premium' && !isPremium) {
      return res.status(403).json({
        detail: 'This template uses Premium features (its layout, fonts or effects). Upgrade to apply it — you can still view it.',
        tier,
      });
    }

    // Apply the parts of the template the visitor asked for, on top of their own
    // profile. Anything they left out keeps whatever they already had, and the
    // links and widgets are the visitor's own by construction (see
    // NEVER_COPIED) — the two lines below say so out loud.
    const currentProfile = req.user.profile || {};
    const chosen = filterTemplateConfig(templateConfig, req.body?.include);
    const mergedProfile = { ...currentProfile, ...chosen };
    if (currentProfile.links) mergedProfile.links = currentProfile.links;
    if (currentProfile.widgets) mergedProfile.widgets = currentProfile.widgets;

    const updateRes = await query('UPDATE users SET profile = $1 WHERE id = $2 RETURNING *', [
      JSON.stringify(mergedProfile),
      req.user.id
    ]);

    // Increment downloads count asynchronously
    await query('UPDATE community_templates SET downloads_count = downloads_count + 1 WHERE id = $1', [id]);

    return res.json(formatUser(updateRes.rows[0]));
  } catch (err) {
    console.error('Apply template error:', err);
    return res.status(500).json({ detail: 'Failed to apply template' });
  }
});

// DELETE /api/templates/:id - delete template
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === 'admin' || req.user.is_owner;
    
    const check = await query('SELECT creator_id FROM community_templates WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ detail: 'Template not found' });
    }

    if (check.rows[0].creator_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ detail: 'Unauthorized to delete this template' });
    }

    await query('DELETE FROM community_templates WHERE id = $1', [id]);
    return res.json({ ok: true, detail: 'Template deleted' });
  } catch (err) {
    console.error('Delete template error:', err);
    return res.status(500).json({ detail: 'Failed to delete template' });
  }
});

export default router;
