import fs from "fs";
import path from "path";

const ROOT = process.env.THUMBNAIL_CACHE_PATH
  ? path.resolve(process.env.THUMBNAIL_CACHE_PATH)
  : path.resolve(process.cwd(), "data", "thumbnails");

// Defensive re-validation even though callers (api-routes.ts) already regex-check.
// Keeps this module safe to reuse/import elsewhere without relying on caller discipline.
const TV_ID_RE = /^tv_[\d_]+$/;
const CONTENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function assertSafe(tvId: string, contentId?: string): void {
  if (!TV_ID_RE.test(tvId)) throw new Error(`Invalid tvId for cache: ${tvId}`);
  if (contentId !== undefined && !CONTENT_ID_RE.test(contentId)) {
    throw new Error(`Invalid contentId for cache: ${contentId}`);
  }
}

function tvDir(tvId: string): string {
  return path.join(ROOT, tvId);
}

function filePath(tvId: string, contentId: string): string {
  return path.join(tvDir(tvId), `${contentId}.jpg`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Return cached thumbnail bytes for tvId/contentId, or null if not cached. */
export function getCached(tvId: string, contentId: string): Buffer | null {
  assertSafe(tvId, contentId);
  try {
    const fp = filePath(tvId, contentId);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp);
  } catch {
    return null; // treat unreadable cache as a miss, fall through to TV fetch
  }
}

/** Persist a freshly-fetched thumbnail to disk. Best-effort: failures are logged, not thrown —
 *  a cache-write failure must never break the response that already has the bytes in hand. */
export function setCached(tvId: string, contentId: string, data: Buffer): void {
  assertSafe(tvId, contentId);
  try {
    const dir = tvDir(tvId);
    ensureDir(dir);
    const fp = filePath(tvId, contentId);
    // Temp file must live in the same directory as the destination — rename() across
    // filesystems (e.g. /tmp vs. a mounted volume in Docker) fails with EXDEV.
    const tmp = path.join(dir, `.${contentId}-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, fp);
  } catch (e) {
    console.error(`[thumbnail-cache] failed to cache ${tvId}/${contentId}:`, e);
  }
}

/** Remove one cached thumbnail (e.g. after this app deletes the photo from the TV). */
export function deleteCached(tvId: string, contentId: string): void {
  assertSafe(tvId, contentId);
  try {
    fs.rmSync(filePath(tvId, contentId), { force: true });
  } catch (e) {
    console.error(`[thumbnail-cache] failed to delete cache for ${tvId}/${contentId}:`, e);
  }
}

/** Prune cache entries for a TV that no longer correspond to a photo on the TV.
 *  Call after every listPhotos() so photos deleted via the TV remote/SmartThings
 *  (i.e. not through this app) don't leave stale thumbnails sitting on disk. */
export function reconcile(tvId: string, validContentIds: string[]): void {
  assertSafe(tvId);
  const dir = tvDir(tvId);
  try {
    if (!fs.existsSync(dir)) return;
    const valid = new Set(validContentIds);
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".jpg")) continue;
      const contentId = entry.slice(0, -4);
      if (!valid.has(contentId)) {
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    }
  } catch (e) {
    console.error(`[thumbnail-cache] reconcile failed for ${tvId}:`, e);
  }
}

/** Remove all cached thumbnails for a TV (e.g. on unpair/disconnect). */
export function clearForTv(tvId: string): void {
  assertSafe(tvId);
  try {
    fs.rmSync(tvDir(tvId), { recursive: true, force: true });
  } catch (e) {
    console.error(`[thumbnail-cache] clearForTv failed for ${tvId}:`, e);
  }
}
