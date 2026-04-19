/**
 * SamsungArtClient — manages the WebSocket connection to a Samsung Frame TV's
 * Art Mode channel and handles binary image uploads over a raw TCP socket.
 *
 * Protocol details:
 *  1. Connect to ws://[IP]:8001/api/v2/channels/com.samsung.art-app
 *  2. Wait for ms.channel.ready (NOT just ms.channel.connect)
 *  3. Send send_image command — inner `data` field is double-JSON-encoded
 *  4. TV responds with ready_to_use — conn_info is also a JSON string (parse twice)
 *  5. Open raw TCP socket, send [4-byte BE header length][JSON header][JPEG bytes]
 *  6. secKey in TCP header MUST exactly match key from conn_info
 *  7. Wait for image_added WebSocket event → contains content_id
 */

import WebSocket from "ws";
import net from "net";
import tls from "tls";
import { v4 as uuidv4 } from "uuid";
import type { DiscoveredTV } from "@/lib/types";

const APP_NAME = process.env.TV_APP_NAME || "Frame Uploader";
const DEVICE_ID = process.env.TV_DEVICE_ID || "frame-uploader-server-001";
const ART_CHANNEL = "com.samsung.art-app";
const UPLOAD_TIMEOUT_MS = 60_000;

interface ConnInfo {
  ip: string;
  port: string;
  secured: boolean;
  key: string;
}

export class SamsungArtClient {
  private tv: DiscoveredTV;
  private token: string | null;
  private ws: WebSocket | null = null;

  constructor(tv: DiscoveredTV, token: string | null) {
    this.tv = tv;
    this.token = token;
  }

  private buildWsUrl(): string {
    // Use same JSON name format as the pairing channel — required for 2022+ firmware.
    const namePayload = JSON.stringify({
      appId: "com.samsung.frameuploader",
      deviceName: APP_NAME,
      deviceId: DEVICE_ID,
    });
    const encodedName = Buffer.from(namePayload).toString("base64");
    const { ip, port } = this.tv;

    if (port === 8002 && this.token) {
      return `wss://${ip}:${port}/api/v2/channels/${ART_CHANNEL}?name=${encodedName}&token=${this.token}`;
    }
    return `ws://${ip}:${port}/api/v2/channels/${ART_CHANNEL}?name=${encodedName}`;
  }

  /** Send a command to the art channel (ms.channel.emit envelope). */
  private sendArtCommand(ws: WebSocket, artRequest: object): void {
    const message = {
      method: "ms.channel.emit",
      params: {
        event: "art_app_request",
        to: "host",
        data: JSON.stringify(artRequest), // intentionally double-encoded
      },
    };
    ws.send(JSON.stringify(message));
  }

  /**
   * Upload a single JPEG image buffer to Art Mode.
   * Returns the TV-assigned content_id (e.g. "MY_F0042").
   */
  uploadImage(
    imageBuffer: Buffer,
    fileSize: number,
    matteId: string,
    onProgress: (percent: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = this.buildWsUrl();
      console.log("[art-client] connecting to:", url.replace(/token=[^&]+/, "token=***"));
      const ws = new WebSocket(url, { rejectUnauthorized: false });
      this.ws = ws;

      const requestId = uuidv4();
      // connection_id must be a random uint32 (not UUID)
      const connectionId = Math.floor(Math.random() * 4_294_967_296);

      let artReady = false;
      let settled = false;
      const settle = (err?: Error, contentId?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(err); else resolve(contentId!);
      };

      const timeout = setTimeout(() => {
        ws.close();
        settle(new Error("Upload timed out. Check your Wi-Fi and try again."));
      }, UPLOAD_TIMEOUT_MS);

      ws.on("open", () => console.log("[art-client] connected, waiting for ms.channel.ready"));

      ws.on("error", (e) => {
        console.error("[art-client] ws error:", e.message);
        settle(new Error(`Connection to TV was lost. Check your Wi-Fi and try again. (${e.message})`));
      });

      ws.on("close", (code) => {
        console.log("[art-client] ws closed, code:", code);
        // 1005 is Samsung's normal close frame — don't treat as an error if already settled.
        settle(new Error("Connection to TV closed unexpectedly. Try again."));
      });

      ws.on("message", async (raw) => {
        let outer: Record<string, unknown>;
        try {
          outer = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        const event = outer.event as string | undefined;

        // ── Art channel is ready — send image immediately (skip get_api_version
        //    which causes some 2022 firmware to close the channel).
        if (event === "ms.channel.ready" && !artReady) {
          artReady = true;
          onProgress(15);

          const now = new Date();
          const imageDate = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, "0")}:${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

          this.sendArtCommand(ws, {
            request: "send_image",
            file_type: "jpg", // must be "jpg" not "jpeg"
            id: requestId,
            request_id: requestId,
            conn_info: {
              d2d_mode: "socket",
              connection_id: connectionId,
              id: requestId,
            },
            image_date: imageDate,
            matte_id: matteId,
            portrait_matte_id: matteId,
            file_size: fileSize,
          });
          onProgress(20);
          return;
        }

        // Parse inner art event (data may be a JSON string)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let innerData: any = outer.data;
        if (typeof innerData === "string") {
          try {
            innerData = JSON.parse(innerData);
          } catch {
            // not JSON, use as-is
          }
        }

        const innerEvent = (innerData?.event as string) ?? (outer.event as string);

        // ── TV is ready for binary transfer ──────────────────────────────────
        if (innerEvent === "ready_to_use") {
          onProgress(30);

          // conn_info is a JSON string — parse it again
          let connInfo: ConnInfo;
          try {
            const raw = innerData?.conn_info ?? innerData?.data?.conn_info;
            connInfo = typeof raw === "string" ? JSON.parse(raw) : raw;
          } catch (e) {
            ws.close();
            settle(new Error("Unexpected response from TV. Try again."));
            return;
          }

          // Validate conn_info — reject if IP doesn't match the known TV or port is out of range.
          // Prevents SSRF if a compromised TV or MITM sends a malicious conn_info.
          const connPort = parseInt(connInfo.port, 10);
          if (connInfo.ip !== this.tv.ip || isNaN(connPort) || connPort < 1024 || connPort > 65535) {
            ws.close();
            settle(new Error("TV returned unexpected connection info. Try again."));
            return;
          }

          try {
            await this.transferBinaryImage(
              imageBuffer,
              connInfo,
              onProgress
            );
          } catch (e) {
            ws.close();
            settle(e instanceof Error ? e : new Error(String(e)));
            return;
          }

          onProgress(80);
          return;
        }

        // ── Image successfully added ─────────────────────────────────────────
        if (innerEvent === "image_added") {
          onProgress(100);
          const contentId =
            innerData?.content_id ??
            innerData?.data?.content_id ??
            "unknown";
          ws.close();
          settle(undefined, String(contentId));
          return;
        }

        // ── Art mode not available ───────────────────────────────────────────
        if (innerEvent === "error" || innerEvent === "art_mode_off") {
          ws.close();
          settle(new Error("This TV doesn't support Art Mode uploads. Make sure your TV is a Samsung Frame TV."));
        }
      });
    });
  }

  /**
   * Query the TV for its supported matte types and colors.
   * Returns { matte_type_list: string[], matte_color_list?: string[] }.
   * Useful for discovering the exact matte IDs valid for change_matte.
   */
  getMatteList(): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const url = this.buildWsUrl();
      const ws = new WebSocket(url, { rejectUnauthorized: false });
      let settled = false;
      const done = (result: Record<string, unknown> = {}) => {
        if (!settled) { settled = true; ws.close(); resolve(result); }
      };
      const timeout = setTimeout(() => done(), 8_000);

      ws.on("error", () => { clearTimeout(timeout); done(); });
      ws.on("close", () => { clearTimeout(timeout); done(); });

      ws.on("message", (raw) => {
        const str = raw.toString();
        console.log("[art-client] getMatteList msg:", str.slice(0, 400));
        let outer: Record<string, unknown>;
        try { outer = JSON.parse(str) as Record<string, unknown>; } catch { return; }

        if (outer.event === "ms.channel.ready") {
          const reqId = uuidv4();
          this.sendArtCommand(ws, {
            request: "get_matte_list",
            id: reqId,
            request_id: reqId,
          });
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let inner: any = outer.data;
        if (typeof inner === "string") { try { inner = JSON.parse(inner); } catch { return; } }
        const ev = inner?.event as string | undefined;

        if (ev === "get_matte_list") {
          clearTimeout(timeout);
          // Normalize: matte_type_list and matte_color_list may themselves be JSON strings
          const result: Record<string, unknown> = {};
          for (const key of ["matte_type_list", "matte_list", "matte_color_list"]) {
            if (inner[key] !== undefined) {
              const val = inner[key];
              result[key] = typeof val === "string" ? JSON.parse(val) : val;
            }
          }
          console.log("[art-client] matte list:", JSON.stringify(result));
          done(result);
        }
      });
    });
  }

  /**
   * Apply a matte to a stored image via a fresh art channel connection.
   * matteId must be a value from getMatteList() — e.g. "shadowbox_polar".
   */
  setMatte(contentId: string, matteId: string): Promise<void> {
    return new Promise((resolve) => {
      const url = this.buildWsUrl();
      const ws = new WebSocket(url, { rejectUnauthorized: false });
      let settled = false;
      let inPhase2 = false;
      let phaseTimer: ReturnType<typeof setTimeout> | null = null;

      const done = () => {
        if (settled) return;
        settled = true;
        if (phaseTimer) clearTimeout(phaseTimer);
        clearTimeout(timeout);
        ws.close();
        resolve();
      };
      const timeout = setTimeout(done, 15_000);

      ws.on("error", () => done());
      ws.on("close", () => done());

      const startPhase2 = () => {
        if (settled || inPhase2) return;
        inPhase2 = true;
        console.log("[art-client] setMatte phase 2: select_image →", contentId, matteId);
        const reqId = uuidv4();
        this.sendArtCommand(ws, {
          request: "select_image",
          content_id: contentId,
          matte_id: matteId,
          portrait_matte_id: matteId,
          category_id: "MY-C0002",
          show: true,
          id: reqId,
          request_id: reqId,
        });
        // Resolve after 6 s if TV doesn't confirm — select_image stores the matte
        // even if change_matte never fires.
        setTimeout(done, 6000);
      };

      ws.on("message", (raw) => {
        const str = raw.toString();
        console.log("[art-client] setMatte msg:", str.slice(0, 300));
        let outer: Record<string, unknown>;
        try { outer = JSON.parse(str) as Record<string, unknown>; } catch { return; }

        if (outer.event === "ms.channel.ready") {
          // Phase 1: change_matte with content_id — works when TV is already in Art Mode.
          const reqId = uuidv4();
          this.sendArtCommand(ws, {
            request: "change_matte",
            content_id: contentId,
            matte_id: matteId,
            portrait_matte_id: matteId,
            id: reqId,
            request_id: reqId,
          });
          console.log("[art-client] setMatte phase 1: change_matte", contentId, matteId);
          // If the TV doesn't confirm within 3 s, fall through to select_image.
          phaseTimer = setTimeout(startPhase2, 3000);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let inner: any = outer.data;
        if (typeof inner === "string") { try { inner = JSON.parse(inner); } catch { /**/ } }
        const ev = inner?.event as string | undefined;

        if (ev === "matte_changed") {
          console.log("[art-client] matte_changed confirmed");
          done();
          return;
        }

        if (ev === "image_selected" && inPhase2) {
          // Image is now active — send change_matte without content_id.
          const reqId = uuidv4();
          this.sendArtCommand(ws, {
            request: "change_matte",
            matte_id: matteId,
            portrait_matte_id: matteId,
            id: reqId,
            request_id: reqId,
          });
          console.log("[art-client] setMatte phase 2b: change_matte (no content_id)", matteId);
          // Allow 3 s for confirmation, then resolve anyway.
          setTimeout(done, 3000);
        }

        if (ev === "error") {
          console.log("[art-client] setMatte error:", JSON.stringify(inner));
          // Phase 1 failed immediately — skip the wait and go to phase 2 now.
          if (!inPhase2) {
            if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
            startPhase2();
          }
        }
      });
    });
  }

  /** Transfer image bytes over a raw TCP socket using the Frame TV binary protocol. */
  private transferBinaryImage(
    imageBuffer: Buffer,
    connInfo: ConnInfo,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = parseInt(connInfo.port, 10);
      const ip = connInfo.ip;

      const header = JSON.stringify({
        num: 0,
        total: 1,
        fileLength: imageBuffer.byteLength,
        fileName: "image",
        fileType: "jpg",
        secKey: connInfo.key, // MUST match key from conn_info exactly
        version: "0.0.1",
      });

      const headerBuf = Buffer.from(header, "ascii");
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32BE(headerBuf.byteLength, 0);

      const socketTimeout = 30_000;

      const doTransfer = (socket: net.Socket) => {
        socket.setTimeout(socketTimeout);

        socket.on("timeout", () => {
          socket.destroy();
          reject(new Error("Photo transfer timed out. Try again with a smaller photo."));
        });

        socket.on("error", (e) => {
          reject(
            new Error(`Photo transfer failed. Check your Wi-Fi and try again. (${e.message})`)
          );
        });

        socket.on("connect", () => {
          onProgress(40);
          socket.write(lenBuf);
          socket.write(headerBuf);

          // Stream image in chunks to report progress
          const CHUNK = 65_536;
          let offset = 0;

          const writeChunk = () => {
            while (offset < imageBuffer.byteLength) {
              const end = Math.min(offset + CHUNK, imageBuffer.byteLength);
              const chunk = imageBuffer.slice(offset, end);
              offset = end;
              const percent = 40 + Math.floor((offset / imageBuffer.byteLength) * 35);
              onProgress(percent);
              const canContinue = socket.write(chunk);
              if (!canContinue) {
                socket.once("drain", writeChunk);
                return;
              }
            }
            socket.end();
            onProgress(75);
            resolve();
          };

          writeChunk();
        });
      };

      if (connInfo.secured) {
        const socket = tls.connect(
          { port, host: ip, rejectUnauthorized: false },
          () => {}
        );
        doTransfer(socket);
      } else {
        const socket = net.connect({ port, host: ip });
        doTransfer(socket);
      }
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
