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
        if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = JSON.parse(body) as any;
            resolve(data?.device?.FrameTVSupport === "true" ? ip : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.setTimeout(PROBE_TIMEOUT_MS, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

/** Scan all hosts in detected subnets, returning IPs of Frame TVs found. */
export async function scanSubnetForFrameTVs(): Promise<string[]> {
  const subnets = detectLocalSubnets();
  if (subnets.length === 0) return [];

  const candidates: string[] = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
      candidates.push(`${subnet}.${i}`);
    }
  }

  const found: string[] = [];

  // Process in batches of CONCURRENCY
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(probeHttp));
    for (const ip of results) {
      if (ip) found.push(ip);
    }
  }

  return found;
}
