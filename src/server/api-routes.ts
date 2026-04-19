import { Router, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import type { ApiOk, ApiError } from "@/lib/types";

// Import manager lazily so module is loaded once server is initialised
let _manager: typeof import("./tv-connection-manager") | null = null;
async function getManager() {
  if (!_manager) _manager = await import("./tv-connection-manager");
  return _manager;
}

export const apiRouter = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Accept only valid dotted-quad IPv4 that isn't loopback or link-local (prevents SSRF). */
function isValidIPv4(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  // Block loopback (127.*), link-local (169.254.*), and unspecified (0.*)
  if (a === 127 || a === 0 || (a === 169 && b === 254)) return false;
  return true;
}

const TV_ID_RE = /^tv_[\d_]+$/;
const MATTE_ID_RE = /^[a-z_]{1,40}$/;

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

// ─── Multer with MIME type filter ─────────────────────────────────────────────

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/tiff", "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_SIZE_MB) || 100) * 1024 * 1024,
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

// ─── Upload ───────────────────────────────────────────────────────────────────

apiRouter.post(
  "/tv/:tvId/upload",
  uploadLimiter,
  upload.array("files"),
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
