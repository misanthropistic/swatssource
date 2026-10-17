import { Router } from 'express';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_DIR, '..');

const IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/*.log',
];

function pickRoot() {
  // Prefer the monorepo root (frontend + backend). Fall back to the backend
  // directory when the API is deployed on its own.
  return fs.existsSync(path.join(REPO_ROOT, 'frontend')) ? REPO_ROOT : BACKEND_DIR;
}

router.get('/download-site', (req, res) => {
  const root = pickRoot();
  const stamp = new Date().toISOString().slice(0, 10);

  res.attachment(`swats-bio-source-${stamp}.zip`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (err) => console.warn('download-site warning:', err.message));
  archive.on('error', (err) => {
    console.error('download-site archive error:', err.message);
    if (!res.headersSent) res.status(500).json({ detail: 'Failed to build archive' });
    else res.destroy(err);
  });

  archive.pipe(res);
  archive.glob('**/*', { cwd: root, dot: true, ignore: IGNORE });
  archive.finalize();
});

export default router;
