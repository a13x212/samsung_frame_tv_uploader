import { Router, Request, Response, NextFunction } from "express";
import { isIPv4 } from "net";
import multer from "multer";
import rateLimit from "express-rate-limit";
import type { ApiOk, ApiError } from "@/lib/types";
import { MAX_UPLOAD_FILES } from "@/lib/types";

// Import manager lazily so module is loaded once server is initialised
let _manager: typeof import("./tv-connection-manager") | null = null;
async function getManager() {
  if (!_manager) _manager = await import("./tv-connection-manager");
  return _manager;
}

export const apiRouter = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Accept only canonical dotted-quad IPv4 outside special-purpose ranges (SSRF guard).
 *
 * The string is later passed verbatim to http.get / WebSocket, and the OS resolver
 * treats leading-zero octets as octal ("0177.0.0.1" → 127.0.0.1), so non-canonical
 * forms must be rejected outright rather than normalised with parseInt.
 * RFC1918 and public addresses stay allowed (the TV lives on the LAN, sometimes routed).
 */
export function isValidIPv4(ip: string): boolean {
  if (typeof ip !== "string" || !isIPv4(ip)) return false;
  const octets = ip.split(".");
  if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o) || /^0\d/.test(o))) {
    return false;
  }
  const [a, b] = octets.map(Number);
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 127) return false; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local
  if (a >= 224) return false; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved + broadcast
  return true;
}

const TV_ID_RE = /^tv_[\d_]+$/;
const MATTE_ID_RE = /^[a-z_]{1,40}$/;
const CONTENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ─── Magic-bytes validation ───────────────────────────────────────────────────

type MagicCheck = (b: Buffer) => boolean;
const IMAGE_MAGIC: MagicCheck[] = [
  // JPEG
  (b) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  // PNG
  (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  // GIF
  (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  // WebP (RIFF....WEBP)
  (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
         b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  // TIFF (little-endian or big-endian)
  (b) => b.length >= 4 && (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00) ||
    (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)
  ),
  // HEIC/HEIF — ISO Base Media file (ftyp box at offset 4)
  (b) => b.length >= 8 && b.slice(4, 8).toString("ascii") === "ftyp",
];

function hasValidImageMagic(buffer: Buffer): boolean {
  return IMAGE_MAGIC.some((check) => check(buffer));
}

/** Strip HTML special chars and cap length to avoid leaking internal error details. */
function sanitizeError(msg: string): string {
  return msg.replace(/[<>"'`]/g, "").slice(0, 200);
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

const discoverLimiter = rateLimit({
  windowMs: 30_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many discovery requests", hint: "Wait 30 seconds and try again" },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many upload requests", hint: "Wait a minute and try again" },
});

const thumbnailLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many thumbnail requests", hint: "Wait a minute and try again" },
});

const manageLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests", hint: "Wait a minute and try again" },
});

// ─── Multer with MIME type filter ─────────────────────────────────────────────

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/tiff", "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_SIZE_MB) || 100) * 1024 * 1024,
    // Cap file count here so excess files are rejected while streaming, before
    // they are all buffered in memory.
    files: MAX_UPLOAD_FILES,
    fields: 40,
    fieldSize: 1024,
  },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME.has(file.mimetype));
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(res: Response, data: T, status = 200) {
  const body: ApiOk<T> = { ok: true, data };
  res.status(status).json(body);
}

function err(res: Response, error: string, hint: string, status = 400) {
  const body: ApiError = { ok: false, error, hint };
  res.status(status).json(body);
}

/** Run multer and turn its errors into clean JSON instead of Express's HTML error page. */
function uploadFiles(req: Request, res: Response, next: NextFunction) {
  upload.array("files")(req, res, (e: unknown) => {
    if (!e) { next(); return; }
    if (e instanceof multer.MulterError) {
      switch (e.code) {
        case "LIMIT_FILE_COUNT":
          err(res, "Too many files", `Upload at most ${MAX_UPLOAD_FILES} photos at a time`);
          return;
        case "LIMIT_FILE_SIZE":
          err(res, "File too large", "One or more photos exceed the maximum upload size", 413);
          return;
        case "LIMIT_UNEXPECTED_FILE":
          err(res, "Unexpected file field", 'Send photos in the "files" field');
          return;
        default:
          err(res, "Invalid upload", sanitizeError(e.message));
          return;
      }
    }
    console.error("[upload parse]", e);
    err(res, "Upload failed", "Try again", 400);
  });
}

// ─── CSRF / cross-site guard ──────────────────────────────────────────────────
// The API has no auth and is reachable LAN-wide. Block browser-initiated
// cross-site state-changing requests (CORS "simple" POSTs need no preflight).
// Requests with neither header (curl, scripts) pass: this is CSRF defense, not auth.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    err(res, "Cross-site request blocked", "Use the uploader from its own page", 403);
    return;
  }

  const origin = req.get("origin");
  if (origin !== undefined) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null; // e.g. "null" origin from sandboxed iframes
    }
    if (!originHost || originHost !== req.get("host")) {
      err(res, "Cross-site request blocked", "Use the uploader from its own page", 403);
      return;
    }
  }

  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────

apiRouter.get("/health", (_req: Request, res: Response) => {
  ok(res, { status: "ok", uptime: process.uptime() });
});

// ─── Discovery ────────────────────────────────────────────────────────────────

// ─── Session (persisted state) ────────────────────────────────────────────────

apiRouter.get("/tv/session", async (_req: Request, res: Response) => {
  try {
    const { tvManager } = await getManager();
    const tvs = tvManager.listDiscovered();
    const connections = tvManager.listConnections();
    ok(res, { tvs, connections });
  } catch (e) {
    console.error("[session]", e);
    err(res, "Failed to load session", "Try refreshing the page", 500);
  }
});

// ─── Discovery ────────────────────────────────────────────────────────────────

apiRouter.post("/tv/discover", discoverLimiter, async (req: Request, res: Response) => {
  try {
    const { tvManager } = await getManager();
    const { manualIp } = req.body as { manualIp?: string };

    if (manualIp) {
      const trimmed = manualIp.trim();
      if (!isValidIPv4(trimmed)) {
        err(res, "Invalid IP address", "Enter a valid IP address like 192.168.1.100");
        return;
      }
      // addManualTV always returns a TV entry (falls back to basic entry if probe fails)
      const tv = await tvManager.addManualTV(trimmed);
      if (!tv) {
        err(res, "Invalid IP address", "Enter a valid IP address like 192.168.1.100");
        return;
      }
      ok(res, { tvs: tvManager.listDiscovered(), scanDurationMs: 0 });
      return;
    }

    const result = await tvManager.discover();
    ok(res, result);
  } catch (e) {
    console.error("[discover]", e);
    err(res, "Discovery failed", "Make sure you are on the same Wi-Fi network as your TV", 500);
  }
});

apiRouter.get("/tv/list", async (_req: Request, res: Response) => {
  try {
    const { tvManager } = await getManager();
    ok(res, { tvs: tvManager.listDiscovered() });
  } catch (e) {
    console.error("[list]", e);
    err(res, "Failed to list TVs", "Try scanning again", 500);
  }
});

// ─── Pairing ──────────────────────────────────────────────────────────────────

apiRouter.post("/tv/:tvId/pair", async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }
  try {
    const { tvManager } = await getManager();
    await tvManager.startPairing(tvId);
    ok(res, { tvId });
  } catch (e: unknown) {
    console.error("[pair]", e);
    const msg = sanitizeError(e instanceof Error ? e.message : "Unknown error");
    err(res, msg, "Make sure your TV is on and try again", 500);
  }
});

apiRouter.get("/tv/:tvId/pair/status", async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }
  try {
    const { tvManager } = await getManager();
    const connection = tvManager.getConnection(tvId);
    if (!connection) {
      err(res, "TV not found", "Start pairing first", 404);
      return;
    }
    ok(res, connection);
  } catch (e) {
    console.error("[pair/status]", e);
    err(res, "Failed to get pairing status", "Try again", 500);
  }
});

apiRouter.delete("/tv/:tvId/pair", async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }
  try {
    const { tvManager } = await getManager();
    await tvManager.disconnect(tvId);
    ok(res, { tvId });
  } catch (e) {
    console.error("[pair delete]", e);
    err(res, "Failed to disconnect", "Try again", 500);
  }
});

// ─── Matte list ───────────────────────────────────────────────────────────────

apiRouter.get("/tv/:tvId/matte-list", async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }
  try {
    const { tvManager } = await getManager();
    const matteList = await tvManager.getMatteList(tvId);
    ok(res, matteList);
  } catch (e: unknown) {
    console.error("[matte-list]", e);
    const msg = sanitizeError(e instanceof Error ? e.message : "Failed to get matte list");
    err(res, msg, "Make sure the TV is paired and try again", 500);
  }
});

// ─── Photo management (photos already on the TV) ─────────────────────────────

apiRouter.get("/tv/:tvId/photos", manageLimiter, async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }
  try {
    const { tvManager } = await getManager();
    const photos = await tvManager.listPhotos(tvId);
    ok(res, { photos });
  } catch (e: unknown) {
    console.error("[photos list]", e);
    const msg = sanitizeError(e instanceof Error ? e.message : "Failed to list photos");
    err(res, msg, "Make sure the TV is paired and try again", 500);
  }
});

apiRouter.get(
  "/tv/:tvId/photos/:contentId/thumbnail",
  thumbnailLimiter,
  async (req: Request, res: Response) => {
    const tvId = String(req.params.tvId);
    const contentId = String(req.params.contentId);
    if (!TV_ID_RE.test(tvId) || !CONTENT_ID_RE.test(contentId)) {
      err(res, "Invalid request", "", 400);
      return;
    }
    try {
      const { tvManager } = await getManager();
      const thumbnail = await tvManager.getThumbnail(tvId, contentId);
      if (!thumbnail) {
        err(res, "Thumbnail not found", "Try again", 404);
        return;
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(thumbnail);
    } catch (e: unknown) {
      console.error("[thumbnail]", e);
      const msg = sanitizeError(e instanceof Error ? e.message : "Failed to load thumbnail");
      err(res, msg, "Make sure the TV is paired and try again", 500);
    }
  }
);

apiRouter.delete("/tv/:tvId/photos", manageLimiter, async (req: Request, res: Response) => {
  const tvId = String(req.params.tvId);
  if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }

  const rawIds = req.body?.contentIds;
  const contentIds: string[] = Array.isArray(rawIds) ? rawIds.map(String) : [];
  if (contentIds.length === 0 || !contentIds.every((id) => CONTENT_ID_RE.test(id))) {
    err(res, "Invalid content IDs", "Select at least one photo to delete");
    return;
  }
  if (contentIds.length > 50) {
    err(res, "Too many photos", "Delete at most 50 photos at a time");
    return;
  }

  try {
    const { tvManager } = await getManager();
    await tvManager.deletePhotos(tvId, contentIds);
    ok(res, { contentIds });
  } catch (e: unknown) {
    console.error("[photos delete]", e);
    const msg = sanitizeError(e instanceof Error ? e.message : "Failed to delete photos");
    err(res, msg, "Make sure the TV is paired and try again", 500);
  }
});

apiRouter.put(
  "/tv/:tvId/photos/:contentId/matte",
  manageLimiter,
  async (req: Request, res: Response) => {
    const tvId = String(req.params.tvId);
    const contentId = String(req.params.contentId);
    if (!TV_ID_RE.test(tvId) || !CONTENT_ID_RE.test(contentId)) {
      err(res, "Invalid request", "", 400);
      return;
    }
    const matteId = String(req.body?.matteId ?? "");
    if (!MATTE_ID_RE.test(matteId)) {
      err(res, "Invalid matte ID", "");
      return;
    }
    try {
      const { tvManager } = await getManager();
      await tvManager.changeMatte(tvId, contentId, matteId);
      ok(res, { contentId, matteId });
    } catch (e: unknown) {
      console.error("[matte change]", e);
      const msg = sanitizeError(e instanceof Error ? e.message : "Failed to change matte");
      err(res, msg, "Make sure the TV is paired and try again", 500);
    }
  }
);

// ─── Upload ───────────────────────────────────────────────────────────────────

apiRouter.post(
  "/tv/:tvId/upload",
  uploadLimiter,
  uploadFiles,
  async (req: Request, res: Response) => {
    const tvId = String(req.params.tvId);
    if (!TV_ID_RE.test(tvId)) { err(res, "Invalid TV ID", "", 400); return; }

    const files = req.files as Express.Multer.File[] | undefined;
    // matteIds is a parallel array to files — one matte ID per uploaded file.
    const rawMatteIds = req.body?.matteIds;
    const matteIds: string[] = (Array.isArray(rawMatteIds)
      ? rawMatteIds.map(String)
      : rawMatteIds
      ? [String(rawMatteIds)]
      : []
    ).map((id) => (MATTE_ID_RE.test(id) ? id : "none"));

    if (!files || files.length === 0) {
      err(res, "No files provided", "Select at least one photo to upload");
      return;
    }

    // Verify actual file content matches an image format regardless of Content-Type header.
    for (const file of files) {
      if (!hasValidImageMagic(file.buffer)) {
        err(res, "Invalid file type", "Only image files (JPEG, PNG, WebP, HEIC, TIFF, GIF) are accepted");
        return;
      }
    }

    // Set up SSE stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { tvManager } = await getManager();
      const gen = tvManager.uploadImages(tvId, files, matteIds);

      for await (const event of gen) {
        send(event);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (e: unknown) {
      console.error("[upload]", e);
      const msg = sanitizeError(e instanceof Error ? e.message : "Upload failed");
      send({ phase: "error", error: msg, progressPercent: 0 });
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
);
