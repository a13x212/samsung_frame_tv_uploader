// Pure helpers for the Add-photos screen: file validation and matching the
// server's upload SSE events back to the files the user picked.

import type { UploadJob, UploadProgressEvent } from "@/lib/types";
import { MAX_UPLOAD_FILES } from "@/lib/types";

// ─── File validation ────────────────────────────────────────────────────────

/** MIME types the server's image processor accepts (see api-routes magic check). */
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/gif",
];

/** Value for <input accept>. Extensions cover browsers that leave HEIC untyped. */
export const ACCEPT_ATTR = [...ACCEPTED_TYPES, ".heic", ".heif"].join(",");

const ACCEPTED_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?|gif)$/i;

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Browsers often report "" or an odd type for HEIC, so trust the extension.
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  return (file.type === "" || file.type === "application/octet-stream") && ACCEPTED_EXT.test(file.name);
}

const EXT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  gif: "image/gif",
};

/**
 * The server's multer filter silently drops any part whose Content-Type is not
 * an allowed image type. A dropped file would shift every later file's
 * position, breaking both the positional matteIds and the order-based event
 * matching below. Browsers often leave HEIC untyped, so give such files an
 * explicit type from their extension before they are sent.
 */
export function withServerType(file: File): File {
  if (ACCEPTED_TYPES.includes(file.type)) return file;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = EXT_TYPE[ext];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

export interface SkippedFiles {
  /** Files that are not a supported image type. */
  unsupported: string[];
  /** Supported files dropped because the batch would exceed MAX_UPLOAD_FILES. */
  overLimit: string[];
}

/**
 * Split newly chosen files into the ones to keep and the ones skipped (and why),
 * given how many files are already pending.
 */
export function partitionFiles(
  files: File[],
  alreadyPending: number,
  max: number = MAX_UPLOAD_FILES
): { accepted: File[]; skipped: SkippedFiles } {
  const supported: File[] = [];
  const unsupported: string[] = [];
  for (const f of files) {
    if (isAcceptedFile(f)) supported.push(withServerType(f));
    else unsupported.push(f.name);
  }
  const room = Math.max(0, max - alreadyPending);
  return {
    accepted: supported.slice(0, room),
    skipped: { unsupported, overLimit: supported.slice(room).map((f) => f.name) },
  };
}

// ─── Event matching ─────────────────────────────────────────────────────────
//
// The server (TvConnectionManager.uploadImages) walks the uploaded files
// strictly in request order, one at a time, and mints a fresh random jobId per
// file. Every file's first event ("processing") is emitted before any event of
// the next file. So the k-th *distinct* jobId seen on the stream belongs to the
// k-th file we sent. We bind each new server jobId to the next client id in
// send order and route all later events by that binding. File names are never
// used for matching: two photos can share a name, and multer may re-encode
// non-ASCII names.

export interface MatchState {
  /** Client ids in the order the files were appended to the request. */
  order: string[];
  /** server jobId -> client id */
  bound: Map<string, string>;
  /** Index into `order` of the next unbound file. */
  next: number;
}

export function createMatchState(order: string[]): MatchState {
  return { order, bound: new Map(), next: 0 };
}

/** Initial "queued" jobs. jobId is the stable client id, not the server's. */
export function initialJobs(files: { id: string; file: File }[]): UploadJob[] {
  return files.map(({ id, file }) => ({
    jobId: id,
    fileName: file.name,
    fileSize: file.size,
    phase: "queued",
    progressPercent: 0,
    contentId: null,
    error: null,
  }));
}

function isFinished(j: UploadJob): boolean {
  return j.phase === "done" || j.phase === "error";
}

/** Mark every job that has not finished as failed (batch-level failure). */
export function failUnfinished(jobs: UploadJob[], message: string): UploadJob[] {
  return jobs.map((j) =>
    isFinished(j) ? j : { ...j, phase: "error", progressPercent: 0, error: message }
  );
}

/**
 * Apply one SSE event. Mutates `state.bound/next` (binding is a side effect of
 * seeing a new jobId) and returns a new jobs array.
 *
 * Events without a usable jobId are batch-level errors: the server's route
 * catch sends `{ phase: "error", error }` with no jobId, and api-client yields
 * jobId "upload-error" when the request itself is refused.
 */
export function applyUploadEvent(
  state: MatchState,
  jobs: UploadJob[],
  event: Partial<UploadProgressEvent>
): UploadJob[] {
  const serverId = event.jobId;
  if (!serverId || serverId === "upload-error") {
    if (event.phase === "error") {
      return failUnfinished(jobs, event.error || "The TV did not accept the upload.");
    }
    return jobs;
  }

  let clientId = state.bound.get(serverId);
  if (!clientId) {
    if (state.next >= state.order.length) return jobs; // more files than we sent: ignore
    clientId = state.order[state.next++];
    state.bound.set(serverId, clientId);
  }

  return jobs.map((j) =>
    j.jobId === clientId
      ? {
          ...j,
          phase: event.phase ?? j.phase,
          progressPercent: event.progressPercent ?? j.progressPercent,
          contentId: event.contentId ?? j.contentId,
          error: event.phase === "error" ? event.error || "Upload failed" : null,
        }
      : j
  );
}

export function countFinished(jobs: UploadJob[]) {
  let done = 0;
  let failed = 0;
  for (const j of jobs) {
    if (j.phase === "done") done++;
    else if (j.phase === "error") failed++;
  }
  return { done, failed, finished: done + failed };
}
