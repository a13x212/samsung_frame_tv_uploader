/**
 * SamsungTvClient — manages the WebSocket connection to a Samsung TV's
 * remote control channel (samsung.remote.control) for pairing/authentication.
 *
 * Protocol reference:
 *   Port 8001 (ws):  ws://[IP]:8001/api/v2/channels/samsung.remote.control?name=[b64]
 *   Port 8002 (wss): wss://[IP]:8002/api/v2/channels/samsung.remote.control?name=[b64]&token=[token]
 *
 * On first connect, the TV shows an approval dialog. When approved, the TV
 * sends an ms.channel.connect event containing the pairing token.
 */

import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { loadToken } from "./token-store";
import type { DiscoveredTV, PairingStatus } from "@/lib/types";

const APP_NAME = process.env.TV_APP_NAME || "Frame Uploader";
const PAIR_TIMEOUT_MS = 65_000; // slightly longer than TV's ~60s dialog timeout

// Stable device ID so the TV recognises repeated connections from this server.
// In production this could be persisted; for now a fixed value is fine.
const DEVICE_ID = process.env.TV_DEVICE_ID || "frame-uploader-server-001";

export type PairingCallback = (
  status: PairingStatus,
  token?: string,
  errorMessage?: string
) => void;

export class SamsungTvClient {
  private tv: DiscoveredTV;
  private ws: WebSocket | null = null;

  constructor(tv: DiscoveredTV) {
    this.tv = tv;
  }

  private buildWsUrl(endpoint: string, token?: string | null): string {
    // 2022+ Samsung firmware expects name = base64(JSON({appId, deviceName, deviceId}))
    const namePayload = JSON.stringify({
      appId: "com.samsung.frameuploader",
      deviceName: APP_NAME,
      deviceId: DEVICE_ID,
    });
    const encodedName = Buffer.from(namePayload).toString("base64");
    const { ip, port } = this.tv;

    if (port === 8002) {
      const tokenParam = token ? `&token=${token}` : "";
      return `wss://${ip}:${port}/api/v2/channels/${endpoint}?name=${encodedName}${tokenParam}`;
    }
    return `ws://${ip}:${port}/api/v2/channels/${endpoint}?name=${encodedName}`;
  }

  /**
   * Initiate pairing. Non-blocking — calls `onStatus` as the state changes.
   * The TV will show an approval dialog when this is called.
   */
  pair(onStatus: PairingCallback): void {
    const savedToken = loadToken(this.tv.id);
    const url = this.buildWsUrl("samsung.remote.control", savedToken);
    console.log("[samsung-tv-client] connecting to:", url.replace(/token=[^&]+/, "token=***"));

    onStatus("connecting");

    const ws = new WebSocket(url, {
      // Samsung TVs use self-signed certs on port 8002
      rejectUnauthorized: false,
      headers: {
        // Some Samsung firmware rejects WS upgrades without a recognisable Origin header.
        Origin: `http://${this.tv.ip}:8001`,
      },
    });
    this.ws = ws;

    // Guard so a late error/close can't overwrite a terminal status already sent.
    let settled = false;
    const settle = (status: PairingStatus, token?: string, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      onStatus(status, token, errorMessage);
    };

    const timeout = setTimeout(() => {
      ws.close();
      settle("error", undefined, "Connection timed out. Make sure your TV is on and try again.");
    }, PAIR_TIMEOUT_MS);

    ws.on("open", () => {
      onStatus("awaiting_approval");
    });

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const event = msg.event as string | undefined;

      if (event === "ms.channel.connect") {
        // Extract token — may be nested under data.token or data.clients[0].attributes.token
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = msg.data as any;
        let token: string | undefined;

        if (typeof data === "object" && data !== null) {
          token = data.token ?? data.clients?.[0]?.attributes?.token;
        } else if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            token = parsed.token ?? parsed.clients?.[0]?.attributes?.token;
          } catch {
            // ignore
          }
        }

        if (token) {
          settle("paired", token);
        } else if (savedToken) {
          // Re-connected with saved token — already paired
          settle("paired", savedToken);
        } else {
          // Connected but no token yet — still waiting for user approval on older firmware
          onStatus("awaiting_approval");
        }
      } else if (event === "ms.channel.timeOut") {
        ws.close();
        settle("error", undefined, "The TV didn't respond in time. Make sure your TV is on and try again.");
      } else if (event === "ms.channel.unauthorized") {
        ws.close();
        settle("rejected", undefined, "TV denied the connection. Press Allow when the dialog appears on your TV.");
      }
    });

    ws.on("error", (e) => {
      // Samsung TVs close with status code 1005 (technically invalid per WebSocket spec).
      // The ws library emits this as an error, but it's just their normal close — ignore it
      // and let the close handler (or a prior message event) determine the final status.
      if (e.message.includes("1005")) return;
      console.error("[samsung-tv-client] ws error:", e.message);
      settle(
        "error",
        undefined,
        `Can't connect to TV at ${this.tv.ip}. Make sure it's on and on the same Wi-Fi network.`
      );
    });

    ws.on("close", () => {
      // If no terminal status was set (e.g. TV closed without sending any message),
      // treat as an unexpected drop.
      settle("error", undefined, `Connection to TV dropped unexpectedly. Make sure your TV is on and try again.`);
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
