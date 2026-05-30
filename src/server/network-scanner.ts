/**
 * Fallback subnet scanner — probes each host on the local subnet
 * via the Samsung TV REST API (/api/v2/) to detect Frame TVs.
 *
 * Used when SSDP is blocked by the router or TV has SSDP disabled.
 */

import http from "http";
import os from "os";

const PROBE_TIMEOUT_MS =
  Number(process.env.NETWORK_SCAN_TIMEOUT_MS) || 500;
const CONCURRENCY = 20;

/** Discovery debug logging — on by default, silence with DEBUG_DISCOVERY=false */
const DEBUG = process.env.DEBUG_DISCOVERY !== "false";
function dbg(...args: unknown[]) {
  if (DEBUG) console.log("[scan]", ...args);
}

/** Detect the local IPv4 subnet base (e.g. "192.168.1") */
function detectLocalSubnets(): string[] {
  const subnets: string[] = [];
  const interfaces = os.networkInterfaces();

  for (const iface of Object.values(interfaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        const parts = addr.address.split(".");
        if (parts.length === 4) {
          subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }
  }

  return [...new Set(subnets)];
}

/** Probe a single IP using native http (avoids Next.js fetch patches). */
function probeHttp(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${ip}:8001/api/v2/`,
      { timeout: PROBE_TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          dbg(`${ip}: HTTP ${res.statusCode} (responded but not 200)`);
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = JSON.parse(body) as any;
            const frameSupport = data?.device?.FrameTVSupport;
            if (frameSupport === "true") {
              dbg(`${ip}: Frame TV found — ${data?.device?.name || data?.device?.modelName || "unknown"}`);
              resolve(ip);
            } else {
              // A Samsung device that answered :8001 but isn't (or doesn't report as) a Frame TV.
              dbg(`${ip}: responded on :8001 but FrameTVSupport=${frameSupport} — skipping`);
              resolve(null);
            }
          } catch {
            dbg(`${ip}: responded on :8001 but body was not valid JSON`);
            resolve(null);
          }
        });
      }
    );
    req.setTimeout(PROBE_TIMEOUT_MS, () => { req.destroy(); resolve(null); });
    // Most hosts will refuse the connection or be unreachable — that's expected and not logged
    // per-IP to avoid 254 lines of noise. EHOSTUNREACH here points at an interface/routing problem.
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH") {
        dbg(`${ip}: ${e.code} — host/network unreachable (routing or interface issue?)`);
      }
      resolve(null);
    });
  });
}

/** Scan all hosts in detected subnets, returning IPs of Frame TVs found. */
export async function scanSubnetForFrameTVs(): Promise<string[]> {
  const subnets = detectLocalSubnets();
  if (subnets.length === 0) {
    dbg("No local IPv4 subnets detected — nothing to scan. (Are you connected to Wi-Fi?)");
    return [];
  }
  dbg(`Detected subnet(s): ${subnets.map((s) => `${s}.0/24`).join(", ")}`);

  const candidates: string[] = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
      candidates.push(`${subnet}.${i}`);
    }
  }

  const found: string[] = [];
  const start = Date.now();
  dbg(`Probing ${candidates.length} host(s) on :8001/api/v2/ (timeout ${PROBE_TIMEOUT_MS}ms, ${CONCURRENCY} at a time)…`);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(probeHttp));
    for (const ip of results) {
      if (ip) found.push(ip);
    }
  }

  dbg(`Subnet scan done in ${Date.now() - start}ms — ${found.length} Frame TV(s): ${found.join(", ") || "none"}`);
  return found;
}
