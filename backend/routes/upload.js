// Side-effect import first: env.js sanitizes CLOUDINARY_URL before the cloudinary
// module reads it on import.
import '../env.js';
import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readCloudinaryCredentials,
  describeCloudinaryCredentials,
} from '../cloudinaryConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// The profile only ever renders images, audio and video. Accepting anything
// else (a caught mimetype lie can dress an executable up as one of those, but
// honestly-typed document/archive uploads have no content path at all) means a
// Cloudinary folder full of free CDN hosting for junk. Kind-dependent extras
// ride along via `extra`: audio for a background track, fonts for cursors, etc.
const ALLOWED_MIME =
  /^(image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)|audio\/(mpeg|mp3|ogg|wav|flac|aac|mp4|m4a)|video\/(mp4|webm|quicktime))$|^application\/octet-stream$/;

const mimeAllowed = (mimetype) => ALLOWED_MIME.test(String(mimetype || '').toLowerCase().trim());

// Applies the resolved credentials to the Cloudinary SDK.
//
// Returns the credentials actually used so a failure can report which account
// and key it signed with — see cloudinaryConfig.js for why the values are never
// decoded or split. Returns null when storage is not configured at all.
const setupCloudinary = () => {
  const resolved = readCloudinaryCredentials();

  if (resolved.urlProblem) {
    console.warn(`[cloudinary] ${resolved.urlProblem}`);
  }
  if (resolved.conflict) {
    console.warn(
      '[cloudinary] CLOUDINARY_URL and the explicit CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET variables are both set and disagree; CLOUDINARY_URL wins. Remove the stale set to avoid confusion.'
    );
  }
  if (!resolved.credentials) {
    return null;
  }

  const { cloud_name, api_key, api_secret } = resolved.credentials;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return resolved.credentials;
};

// Uploads the in-memory buffer straight to Cloudinary without ever building a
// `data:` URI.
//
// The previous version did `Buffer.from(file.buffer).toString('base64')` for
// every request, before it even knew whether Cloudinary was configured. For a
// 25MB video that is a 25MB buffer plus a ~33MB base64 string held in RAM at the
// same time, on every upload, on a small container.
function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// Writes the buffer to the on-box uploads/ directory and returns its relative
// public path. Only used when Cloudinary is unavailable.
function writeLocalFile(buffer, originalname) {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const safeExt = (String(originalname).split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const filename = `${Date.now()}_${Math.round(Math.random() * 1e6)}.${safeExt}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/api/uploads/${filename}`;
}

// POST /api/upload
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const kind = req.body.kind || 'asset';

    if (!file) {
      return res.status(400).json({ detail: 'No file provided' });
    }

    // Reject BEFORE spending memory/stream budget on it. A profile cannot
    // display a PDF, so refusing here is the fix — not an error toast after a
    // 25MB upload completes.
    if (!mimeAllowed(file.mimetype)) {
      return res.status(415).json({
        detail: 'That file type is not supported. Upload a picture, an audio file or an MP4/WebM video.',
      });
    }

    const isPremium = req.user.tier === 'premium' || req.user.tier === 'admin' || req.user.role === 'admin' || req.user.is_owner;
    const isVideo = file.mimetype.startsWith('video/');

    // A crosshair is a cursor: pictures only, and small. Native cursors are
    // capped at 128px, so a 25MB "crosshair" is storage abuse, not artwork.
    if (/crosshair/i.test(String(kind))) {
      if (!file.mimetype.startsWith('image/')) {
        return res.status(415).json({ detail: 'Crosshair images must be PNG, WEBP, GIF or JPEG.' });
      }
      if (file.size > 1024 * 1024) {
        return res.status(413).json({ detail: 'Crosshair images must be 1MB or smaller.' });
      }
      if (!isPremium) {
        return res.status(403).json({ detail: 'Custom crosshairs are a premium feature' });
      }
    }

    if (isVideo && !isPremium) {
      return res.status(403).json({ detail: 'MP4 and video uploads are premium features' });
    }

    const credentials = setupCloudinary();
    let fileUrl;
    let metadata = { format: (file.mimetype.split('/')[1] || '').toLowerCase() || null };

    if (credentials) {
      const cleanUsername = (req.user.username || 'user').replace(/[^a-z0-9_]/gi, '');
      const cleanKind = String(kind).replace(/[^a-z0-9_]/gi, '');
      try {
        const uploadResponse = await uploadBufferToCloudinary(file.buffer, {
          folder: `swats/${cleanUsername}/${cleanKind}`,
          resource_type: 'auto',
          // Was 5000ms, which a real video or a large image blows through. The
          // request then "succeeded" with a fallback URL pointing at container-
          // local disk, so the media rendered once and 404'd after the next
          // redeploy — the classic "it uploaded but the file is gone" report.
          timeout: 120000,
        });
        fileUrl = uploadResponse?.secure_url;
        // Cloudinary measures the media for us: dimensions, format, byte size,
        // and — for video — its length. Storing it means every consumer (chat
        // bubbles, card previews, the editor) can lay out the media correctly
        // without downloading it first.
        if (uploadResponse) {
          metadata = {
            width: uploadResponse.width ?? null,
            height: uploadResponse.height ?? null,
            format: uploadResponse.format || metadata.format,
            bytes: uploadResponse.bytes ?? file.size,
            duration: uploadResponse.duration ?? null,
          };
        }
      } catch (cloudErr) {
        // Report which account and key were signed with. Cloudinary answers
        // "Invalid Signature" for a wrong cloud name, a wrong api_key, or a
        // wrong api_secret alike (verified against the live API), so the fix is
        // to check all three against the dashboard — never to guess which one
        // is wrong from the message alone.
        const storage = describeCloudinaryCredentials(credentials);
        const message = String(cloudErr.message || cloudErr || 'Cloudinary error');
        const hint = /invalid signature/i.test(message)
          ? ' Cloudinary rejected the signature for these credentials. Check that the cloud name, API key and API secret in the environment all belong to the same Cloudinary account, and that the secret has not been regenerated since it was set.'
          : '';
        console.error('Cloudinary upload failed:', message, JSON.stringify(storage));
        // cloud_name and api_key are public values, so naming them in the message
        // lets the owner spot a wrong account straight from the error toast.
        const signedWith =
          storage.cloud_name && storage.api_key
            ? ` Signed with cloud "${storage.cloud_name}" and API key "${storage.api_key}" (from ${storage.source}).`
            : '';
        return res.status(502).json({
          detail: `Media storage upload failed: ${message}. Nothing was saved — please retry.${signedWith}${hint}`,
          storage,
        });
      }

      if (!fileUrl) {
        return res.status(502).json({ detail: 'Media storage did not return a URL. Nothing was saved — please retry.' });
      }
    } else {
      // No object storage configured: keep the app usable locally, but be honest
      // that this only survives as long as this process/container does.
      console.warn('CLOUDINARY is not configured; storing upload on local disk (not durable in production).');
      fileUrl = writeLocalFile(file.buffer, file.originalname);
      // Local disk has no measuring step: the type and byte size are still
      // known, the geometry is not, and lying with nulls beats guessing.
      metadata = { ...metadata, width: null, height: null, bytes: file.size, duration: null };
    }

    try {
      const { rows } = await query(`
        INSERT INTO files (owner_id, storage_url, original_filename, content_type, size, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING metadata
      `, [req.user.id, fileUrl, file.originalname, file.mimetype, file.size, JSON.stringify(metadata)]);
      metadata = rows[0]?.metadata || metadata;
    } catch (trackErr) {
      console.error('Failed to record upload in files table:', trackErr.message);
    }

    return res.json({ url: fileUrl, metadata });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ detail: err.message || 'Upload failed' });
  }
});

export default router;
