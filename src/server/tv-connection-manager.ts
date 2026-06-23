/**
 * TvConnectionManager — server-side singleton.
 *
 * Manages TV discovery, pairing state, and art-mode uploads.
 * Fully implemented in Phase 2–4. This file is the stub used in Phase 1
 * so the project compiles and /api/health can be verified.
 */

import http from "http";
import os from "os";
import type { DiscoveredTV, TvConnection, UploadProgressEvent } from "@/lib/types";

/** Dump every network interface Node can see — the ground truth for
 *  interface-binding / unreachable-host problems during discovery. */
function logNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const summary: string[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      summary.push(
        `${name}: ${addr.address}/${addr.family}` +
          `${addr.internal ? " (internal)" : ""}${addr.mac && addr.mac !== "00:00:00:00:00:00" ? ` mac=${addr.mac}` : ""}`
      );
    }
  }
  console.log(
    `[discover] os.networkInterfaces():\n  ${summary.join("\n  ") || "(no interfaces reported!)"}`
  );
}

type MulterFile = Express.Multer.File;

/** Caps concurrent execution of a task — the TV can only juggle a handful of
 *  simultaneous Art Mode d2d connections before it starts rejecting/dropping them. */
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/** Use native http.get to avoid Next.js's patched fetch (which blocks local network in dev). */
function httpGet(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.on("error", reject);
  });
}

/** Parse Samsung model string to 4-digit year. e.g. "22_PONTUSM_FTV" → 2022, "2023_QN65LS03B" → 2023 */
function parseModelYear(model: string | undefined): number {
  if (!model) return 0;
  // 4-digit year prefix (e.g. "2023_...")
  const fourDigit = model.match(/^(20\d{2})/);
  if (fourDigit) return parseInt(fourDigit[1]);
  // 2-digit year prefix (e.g. "22_..." or "23_...")
  const twoDigit = model.match(/^(\d{2})_/);
  if (twoDigit) return 2000 + parseInt(twoDigit[1]);
  return 0;
}

class TvConnectionManager {
  private discovered: Map<string, DiscoveredTV> = new Map();
  private connections: Map<string, TvConnection> = new Map();
  // Tracks in-flight pairing clients so re-pairing closes the previous WS connection.
  private pairingClients: Map<string, import("./samsung-tv-client").SamsungTvClient> = new Map();
  // The TV can only handle a few simultaneous Art Mode d2d connections — the browser
  // requests many thumbnails at once (one per visible grid tile), so queue them.
  private thumbnailSemaphore = new Semaphore(1);

  /** Run SSDP + subnet scan, return results. */
  async discover(): Promise<{ tvs: DiscoveredTV[]; scanDurationMs: number }> {
    // Phase 2 implementation
    const start = Date.now();
    console.log("[discover] Starting discovery (SSDP + subnet scan in parallel)…");
    logNetworkInterfaces();
    const { discoverViaSsdp } = await import("./ssdp-discovery");
    const { scanSubnetForFrameTVs } = await import("./network-scanner");

    const [ssdpIps, scanIps] = await Promise.all([
      discoverViaSsdp().catch((e) => {
        console.warn("[discover] SSDP threw:", (e as Error).message);
        return [] as string[];
      }),
      scanSubnetForFrameTVs().catch((e) => {
        console.warn("[discover] Subnet scan threw:", (e as Error).message);
        return [] as string[];
      }),
    ]);

    const allIps = [...new Set([...ssdpIps, ...scanIps])];
    console.log(
      `[discover] SSDP found ${ssdpIps.length} (${ssdpIps.join(", ") || "none"}), ` +
        `scan found ${scanIps.length} (${scanIps.join(", ") || "none"}); ` +
        `${allIps.length} unique IP(s) to probe.`
    );
    const tvs: DiscoveredTV[] = [];

    for (const ip of allIps) {
      const tv = await this.probeTV(ip, ssdpIps.includes(ip) ? "ssdp" : "scan");
      if (tv) {
        this.discovered.set(tv.id, tv);
        tvs.push(tv);
      }
    }

    console.log(
      `[discover] Finished in ${Date.now() - start}ms — returning ${tvs.length} TV(s) to the UI.`
    );
    return { tvs, scanDurationMs: Date.now() - start };
  }

  /** Probe a single IP to get TV info from REST /api/v2/ */
  async probeTV(
    ip: string,
    via: DiscoveredTV["discoveredVia"]
  ): Promise<DiscoveredTV | null> {
    try {
      const body = await httpGet(`http://${ip}:8001/api/v2/`, 2500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(body) as any;
      const device = data?.device ?? {};
      const id = `tv_${ip.replace(/\./g, "_")}`;

      // Use port 8002 (WSS) when the TV advertises TokenAuthSupport — newer firmware
      // (2020+) requires WSS for the pairing handshake even on first connection.
      const useSecure = device.TokenAuthSupport === "true";
      const tv: DiscoveredTV = {
        id,
        ip,
        port: useSecure ? 8002 : 8001,
        name: device.name || device.modelName || "Samsung Frame TV",
        modelYear: parseModelYear(device.model),
        secure: useSecure,
        frameSupported: device.FrameTVSupport === "true",
        discoveredVia: via,
      };

      console.log(`[probe] Found TV at ${ip}: ${tv.name} (${tv.modelYear}), FrameTV: ${tv.frameSupported}`);
      return tv;
    } catch (e) {
      console.log(`[probe] No TV at ${ip}:`, (e as Error).message);
      return null;
    }
  }

  /**
   * Register a TV entered manually by IP.
   * If the REST probe fails (TV is slow or on a different firmware),
   * still add a basic entry so the user can attempt pairing.
   */
  async addManualTV(ip: string): Promise<DiscoveredTV | null> {
    let tv = await this.probeTV(ip, "manual");

    if (!tv) {
      // Probe failed but user explicitly provided this IP — create a basic entry
      // and let pairing validate connectivity
      console.log(`[manual] Probe failed for ${ip}, adding basic entry for user to attempt pairing`);
      const id = `tv_${ip.replace(/\./g, "_")}`;
      tv = {
        id,
        ip,
        port: 8001,
        name: `Samsung TV (${ip})`,
        modelYear: 0,
        secure: false,
        frameSupported: true, // assume true — user says it's a Frame TV
        discoveredVia: "manual",
      };
    }

    this.discovered.set(tv.id, tv);
    return tv;
  }

  /**
   * Called once on server startup — restores any previously-paired TVs from
   * the token store so the user doesn't need to re-discover/re-pair after
   * a server restart.
   */
  async initialize(): Promise<void> {
    const { loadAllTokens } = await import("./token-store");
    const tokens = loadAllTokens();

    for (const [tvId, entry] of Object.entries(tokens)) {
      try {
        const tv = await this.probeTV(entry.ip, "manual");
        if (tv) {
          // Preserve the stored tvId (probe generates a new one from the IP)
          const restored: DiscoveredTV = { ...tv, id: tvId };
          this.discovered.set(tvId, restored);
          this.connections.set(tvId, {
            tvId,
            status: "paired",
            token: entry.token,
            errorMessage: null,
            connectedAt: entry.savedAt,
          });
          console.log(`[init] Restored paired TV: ${restored.name} (${tvId})`);
        } else {
          console.log(`[init] Saved TV ${tvId} at ${entry.ip} unreachable — skipping`);
        }
      } catch {
        // ignore individual probe failures at startup
      }
    }
  }

  listDiscovered(): DiscoveredTV[] {
    return [...this.discovered.values()];
  }

  listConnections(): TvConnection[] {
    return [...this.connections.values()];
  }

  getConnection(tvId: string): TvConnection | null {
    return this.connections.get(tvId) ?? null;
  }

  /** Start pairing with a TV — triggers approval dialog on TV screen. */
  async startPairing(tvId: string): Promise<void> {
    const tv = this.discovered.get(tvId);
    if (!tv) throw new Error(`TV ${tvId} not found. Run discovery first.`);

    // Close any in-flight pairing attempt for this TV before opening a new one.
    const existing = this.pairingClients.get(tvId);
    if (existing) {
      existing.close();
      this.pairingClients.delete(tvId);
    }

    const { SamsungTvClient } = await import("./samsung-tv-client");
    const client = new SamsungTvClient(tv);
    this.pairingClients.set(tvId, client);

    this.connections.set(tvId, {
      tvId,
      status: "connecting",
      token: null,
      errorMessage: null,
      connectedAt: null,
    });

    // Non-blocking — updates connection map as pairing progresses
    client.pair(async (status, token, errorMessage) => {
      this.connections.set(tvId, {
        tvId,
        status,
        token: token ?? null,
        errorMessage: errorMessage ?? null,
        connectedAt: status === "paired" ? new Date().toISOString() : null,
      });

      if (status === "paired" && token) {
        const { saveToken } = await import("./token-store");
        saveToken(tvId, tv.ip, token);
        // Close the pairing WS immediately — we have the token, no reason to
        // keep the remote control channel open and consume TV resources.
        client.close();
        this.pairingClients.delete(tvId);
      } else if (status === "rejected" || status === "error") {
        client.close();
        this.pairingClients.delete(tvId);
      }
    });
  }

  async getMatteList(tvId: string): Promise<Record<string, unknown>> {
    const connection = this.connections.get(tvId);
    if (!connection || connection.status !== "paired") {
      throw new Error("TV is not paired.");
    }
    const tv = this.discovered.get(tvId);
    if (!tv) throw new Error(`TV ${tvId} not found.`);
    const { SamsungArtClient } = await import("./samsung-art-client");
    const client = new SamsungArtClient(tv, connection.token);
    return client.getMatteList();
  }

  /** Get the paired art client for a TV, or throw if not paired. */
  private async getArtClient(tvId: string) {
    const connection = this.connections.get(tvId);
    if (!connection || connection.status !== "paired") {
      throw new Error("TV is not paired.");
    }
    const tv = this.discovered.get(tvId);
    if (!tv) throw new Error(`TV ${tvId} not found.`);
    const { SamsungArtClient } = await import("./samsung-art-client");
    return new SamsungArtClient(tv, connection.token);
  }

  /** List photos already stored in the TV's Art Mode "My Photos" category. */
  async listPhotos(tvId: string) {
    const client = await this.getArtClient(tvId);
    const photos = await client.listContent();
    const { reconcile } = await import("./thumbnail-cache");
    reconcile(tvId, photos.map((p) => p.content_id));
    return photos;
  }

  /** Fetch a single thumbnail JPEG for a photo already on the TV, cached on disk after first fetch. */
  async getThumbnail(tvId: string, contentId: string): Promise<Buffer | null> {
    const { getCached, setCached } = await import("./thumbnail-cache");
    const cached = getCached(tvId, contentId);
    if (cached) return cached;

    return this.thumbnailSemaphore.run(async () => {
      const client = await this.getArtClient(tvId);
      // The TV's d2d socket occasionally drops the connection under rapid sequential
      // fetches (e.g. browsing a large gallery) — one retry clears most of these blips.
      let buf: Buffer | null = null;
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < 2 && !buf; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
        try {
          const thumbnails = await client.getThumbnails([contentId]);
          buf = thumbnails.get(contentId) ?? null;
          lastError = undefined;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
        }
      }
      if (!buf && lastError) throw lastError;
      if (buf) setCached(tvId, contentId, buf);
      return buf;
    });
  }

  /** Permanently delete photos from the TV's Art Mode storage. */
  async deletePhotos(tvId: string, contentIds: string[]): Promise<void> {
    const client = await this.getArtClient(tvId);
    await client.deleteImages(contentIds);
    const { deleteCached } = await import("./thumbnail-cache");
    for (const id of contentIds) deleteCached(tvId, id);
  }

  /** Change the matte on a photo already stored on the TV. */
  async changeMatte(tvId: string, contentId: string, matteId: string): Promise<void> {
    const client = await this.getArtClient(tvId);
    await client.setMatte(contentId, matteId);
  }

  async disconnect(tvId: string): Promise<void> {
    // Close any in-flight pairing attempt before removing the connection.
    const pairing = this.pairingClients.get(tvId);
    if (pairing) {
      pairing.close();
      this.pairingClients.delete(tvId);
    }
    this.connections.delete(tvId);
    const { deleteToken } = await import("./token-store");
    deleteToken(tvId);
    const { clearForTv } = await import("./thumbnail-cache");
    clearForTv(tvId);
  }

  /** Upload images to a paired TV's Art Mode. Yields SSE progress events. */
  async *uploadImages(
    tvId: string,
    files: MulterFile[],
    /** Per-file matte IDs, positionally matched to files. Falls back to "none". */
    matteIds: string[]
  ): AsyncGenerator<UploadProgressEvent> {
    const connection = this.connections.get(tvId);
    if (!connection || connection.status !== "paired") {
      throw new Error("TV is not paired. Please pair with your TV first.");
    }

    const tv = this.discovered.get(tvId);
    if (!tv) throw new Error(`TV ${tvId} not found.`);

    // Cap batch size — the TV has limited memory and can't queue unlimited art uploads.
    const MAX_BATCH = 20;
    if (files.length > MAX_BATCH) {
      throw new Error(`Maximum ${MAX_BATCH} photos per upload. Please select fewer at a time.`);
    }

    const { SamsungArtClient } = await import("./samsung-art-client");
    const { processForFrameTV } = await import("./image-processor");
    const { v4: uuidv4 } = await import("uuid");

    const artClient = new SamsungArtClient(tv, connection.token);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const matteId = matteIds[i] ?? "none";
      const jobId = uuidv4();
      const fileName = file.originalname;

      yield { jobId, fileName, phase: "processing", progressPercent: 5, fileSize: file.size };

      let processed;
      try {
        processed = await processForFrameTV(file.buffer);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Processing failed";
        yield { jobId, fileName, phase: "error", progressPercent: 0, error: msg, fileSize: file.size };
        continue;
      }

      yield { jobId, fileName, phase: "negotiating", progressPercent: 15, fileSize: file.size };

      try {
        // Wire onProgress into SSE by writing to a shared slot the generator drains.
        // We use a simple "last known percent" approach: yield at key thresholds so
        // the UI shows real transfer progress rather than jumping straight to done.
        let lastYieldedPct = 15;
        const progressThresholds = [30, 50, 65, 75, 85];
        let thresholdIdx = 0;

        // Kick off the upload; we'll intersperse progress yields using an async trick.
        let uploadResolve!: (id: string) => void;
        let uploadReject!: (e: unknown) => void;
        const uploadDone = new Promise<string>((res, rej) => {
          uploadResolve = res;
          uploadReject = rej;
        });

        // Accumulate progress ticks from the art client callback
        const progressTicks: number[] = [];
        let progressNotify: (() => void) | null = null;
        const onProgress = (pct: number) => {
          progressTicks.push(pct);
          progressNotify?.();
        };

        // Run upload in background
        artClient
          .uploadImage(processed.buffer, processed.fileSizeBytes, matteId, onProgress)
          .then(uploadResolve)
          .catch(uploadReject);

        // Drain progress ticks while upload runs — yield SSE events for each threshold
        let contentId: string;
        try {
          while (true) {
            // Drain any buffered ticks
            while (progressTicks.length > 0) {
              const pct = progressTicks.shift()!;
              // Yield when we cross the next threshold (avoids flooding SSE with every tick)
              if (thresholdIdx < progressThresholds.length && pct >= progressThresholds[thresholdIdx]) {
                lastYieldedPct = progressThresholds[thresholdIdx];
                thresholdIdx++;
                yield { jobId, fileName, phase: "transferring", progressPercent: lastYieldedPct, fileSize: file.size };
              }
            }

            // Wait for next progress tick or upload completion
            const notified = new Promise<void>((r) => { progressNotify = r; });
            const result = await Promise.race([
              uploadDone.then((id) => ({ done: true, id })),
              notified.then(() => ({ done: false, id: "" })),
            ]);

            if (result.done) {
              contentId = result.id;
              break;
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          yield { jobId, fileName, phase: "error", progressPercent: 0, error: msg, fileSize: file.size };
          // Wait before next file even on error — TV may need recovery time
          if (i < files.length - 1) await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // Apply matte on a fresh connection (1.5 s cooldown after upload WS closes)
        if (matteId && matteId !== "none") {
          yield { jobId, fileName, phase: "transferring", progressPercent: 90, fileSize: file.size };
          await new Promise((r) => setTimeout(r, 1500));
          await artClient.setMatte(contentId, matteId);
        }

        yield { jobId, fileName, phase: "done", progressPercent: 100, contentId, fileSize: file.size };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        yield { jobId, fileName, phase: "error", progressPercent: 0, error: msg, fileSize: file.size };
      }

      // Inter-upload cooldown — give the TV time to write the image to storage
      // before opening a new art channel connection for the next photo.
      if (i < files.length - 1) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }
}

export const tvManager = new TvConnectionManager();
