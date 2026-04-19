// ─── TV Discovery ────────────────────────────────────────────────────────────

export interface DiscoveredTV {
  id: string; // "tv_192_168_1_50"
  ip: string;
  port: number; // 8001 or 8002
  name: string;
  modelYear: number;
  secure: boolean;
  frameSupported: boolean;
  discoveredVia: "ssdp" | "scan" | "manual";
}

// ─── Pairing ─────────────────────────────────────────────────────────────────

export type PairingStatus =
  | "idle"
  | "connecting"
  | "awaiting_approval" // TV showing approval dialog
  | "paired"
  | "rejected"
  | "error";

export interface TvConnection {
  tvId: string;
  status: PairingStatus;
  token: string | null;
  errorMessage: string | null;
  connectedAt: string | null; // ISO date string
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export type UploadPhase =
  | "queued"
  | "processing" // Sharp resize/convert
  | "negotiating" // send_image WebSocket message
  | "transferring" // binary TCP socket
  | "done"
  | "error";

export interface UploadJob {
  jobId: string;
  fileName: string;
  fileSize: number;
  phase: UploadPhase;
  progressPercent: number;
  contentId: string | null; // TV-assigned ID on success (e.g. "MY_F0042")
  error: string | null;
}

export interface UploadProgressEvent {
  jobId: string;
  fileName: string;
  phase: UploadPhase;
  progressPercent: number;
  fileSize?: number;
  contentId?: string;
  error?: string;
}

// ─── Matte ───────────────────────────────────────────────────────────────────
// Matte IDs sent to the TV are "{type}_{color}", e.g. "modernthin_polar".
// Type and color are selected independently in the UI then combined.

export const MATTE_TYPES = [
  { id: "none",       label: "None"        },
  { id: "modernthin", label: "Modern Thin" },
  { id: "modern",     label: "Modern"      },
  { id: "modernwide", label: "Wide"        },
  { id: "flexible",   label: "Flexible"    },
  { id: "shadowbox",  label: "Shadow Box"  },
  { id: "panoramic",  label: "Panoramic"   },
] as const;

/** Colors from the TV's own get_matte_list response — includes exact RGB. */
export const MATTE_COLORS = [
  { id: "polar",     label: "Polar",      r: 232, g: 230, b: 231 },
  { id: "antique",   label: "Antique",    r: 224, g: 219, b: 210 },
  { id: "warm",      label: "Warm",       r: 231, g: 231, b: 223 },
  { id: "neutral",   label: "Neutral",    r: 137, g: 136, b: 134 },
  { id: "black",     label: "Black",      r: 34,  g: 34,  b: 33  },
  { id: "sand",      label: "Sand",       r: 164, g: 145, b: 113 },
  { id: "seafoam",   label: "Seafoam",    r: 90,  g: 104, b: 101 },
  { id: "sage",      label: "Sage",       r: 170, g: 176, b: 141 },
  { id: "burgandy",  label: "Burgundy",   r: 98,  g: 39,  b: 46  },
  { id: "navy",      label: "Navy",       r: 39,  g: 53,  b: 74  },
  { id: "apricot",   label: "Apricot",    r: 239, g: 188, b: 96  },
  { id: "byzantine", label: "Byzantine",  r: 136, g: 86,  b: 137 },
  { id: "lavender",  label: "Lavender",   r: 182, g: 171, b: 177 },
  { id: "redorange", label: "Red-Orange", r: 219, g: 103, b: 66  },
  { id: "skyblue",   label: "Sky Blue",   r: 105, g: 192, b: 211 },
  { id: "turquoise", label: "Turquoise",  r: 46,  g: 150, b: 141 },
] as const;

export type MatteTypeId  = (typeof MATTE_TYPES)[number]["id"];
export type MatteColorId = (typeof MATTE_COLORS)[number]["id"];
/** Full matte ID sent to the TV: "none" or "{type}_{color}" */
export type MatteId = "none" | string;

// Keep MATTE_OPTIONS as a legacy alias so existing imports don't break
export const MATTE_OPTIONS = MATTE_TYPES;

// ─── API Response shapes ──────────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  hint: string;
}

export type ApiResult<T> = ApiOk<T> | ApiError;

// ─── Discover response ────────────────────────────────────────────────────────

export interface DiscoverData {
  tvs: DiscoveredTV[];
  scanDurationMs: number;
}
