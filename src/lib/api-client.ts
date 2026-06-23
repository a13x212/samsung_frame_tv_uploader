import type {
  ApiResult,
  DiscoverData,
  DiscoveredTV,
  TvConnection,
  UploadJob,
  UploadProgressEvent,
  MatteId,
  ArtPhoto,
} from "./types";

const BASE = "";

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  return res.json() as Promise<ApiResult<T>>;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export async function discoverTvs(): Promise<ApiResult<DiscoverData>> {
  return apiFetch<DiscoverData>("/api/tv/discover", { method: "POST" });
}

export async function listTvs(): Promise<ApiResult<{ tvs: DiscoveredTV[] }>> {
  return apiFetch<{ tvs: DiscoveredTV[] }>("/api/tv/list");
}

// ─── Pairing ──────────────────────────────────────────────────────────────────

export async function startPairing(
  tvId: string
): Promise<ApiResult<{ tvId: string }>> {
  return apiFetch<{ tvId: string }>(`/api/tv/${tvId}/pair`, {
    method: "POST",
  });
}

export async function getPairingStatus(
  tvId: string
): Promise<ApiResult<TvConnection>> {
  return apiFetch<TvConnection>(`/api/tv/${tvId}/pair/status`);
}

export async function disconnectTv(
  tvId: string
): Promise<ApiResult<{ tvId: string }>> {
  return apiFetch<{ tvId: string }>(`/api/tv/${tvId}/pair`, {
    method: "DELETE",
  });
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload photos to a paired TV.
 * Returns an async generator that yields UploadProgressEvent from the SSE stream.
 */
export async function* uploadPhotos(
  tvId: string,
  files: File[],
  /** One matte ID per file, positionally matched. Falls back to "none". */
  matteIds: MatteId[] = []
): AsyncGenerator<UploadProgressEvent | { done: true }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  // Send per-file matte IDs so the server can apply the right matte to each image.
  for (let i = 0; i < files.length; i++) {
    formData.append("matteIds", matteIds[i] ?? "none");
  }

  const res = await fetch(`/api/tv/${tvId}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok || !res.body) {
    const err: UploadProgressEvent = {
      jobId: "upload-error",
      fileName: "",
      phase: "error",
      progressPercent: 0,
      error: "Upload request failed",
    };
    yield err;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") {
        yield { done: true };
        return;
      }
      try {
        yield JSON.parse(payload) as UploadProgressEvent;
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}

// ─── Photo management (photos already on the TV) ─────────────────────────────

export async function listPhotos(
  tvId: string
): Promise<ApiResult<{ photos: ArtPhoto[] }>> {
  return apiFetch<{ photos: ArtPhoto[] }>(`/api/tv/${tvId}/photos`);
}

/** URL for an <img> tag — fetched directly by the browser, not via apiFetch. */
export function thumbnailUrl(tvId: string, contentId: string): string {
  return `/api/tv/${tvId}/photos/${encodeURIComponent(contentId)}/thumbnail`;
}

export async function deletePhotos(
  tvId: string,
  contentIds: string[]
): Promise<ApiResult<{ contentIds: string[] }>> {
  return apiFetch<{ contentIds: string[] }>(`/api/tv/${tvId}/photos`, {
    method: "DELETE",
    body: JSON.stringify({ contentIds }),
  });
}

export async function changeMatte(
  tvId: string,
  contentId: string,
  matteId: MatteId
): Promise<ApiResult<{ contentId: string; matteId: string }>> {
  return apiFetch<{ contentId: string; matteId: string }>(
    `/api/tv/${tvId}/photos/${encodeURIComponent(contentId)}/matte`,
    { method: "PUT", body: JSON.stringify({ matteId }) }
  );
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function getSession(): Promise<
  ApiResult<{ tvs: DiscoveredTV[]; connections: TvConnection[] }>
> {
  return apiFetch<{ tvs: DiscoveredTV[]; connections: TvConnection[] }>("/api/tv/session");
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<
  ApiResult<{ status: string; uptime: number }>
> {
  return apiFetch<{ status: string; uptime: number }>("/api/health");
}
