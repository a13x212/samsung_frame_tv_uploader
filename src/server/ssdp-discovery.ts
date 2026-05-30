/**
 * SSDP discovery — finds Samsung TVs on the local network via UDP multicast.
 * Sends an M-SEARCH request to 239.255.255.250:1900 and collects responses.
 */

import dgram from "dgram";
import os from "os";

const SSDP_MULTICAST_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const SAMSUNG_SERVICE_TYPE = "urn:samsung.com:device:RemoteControlReceiver:1";

const MSEARCH_PACKET = [
  "M-SEARCH * HTTP/1.1",
  `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  "MX: 3",
  `ST: ${SAMSUNG_SERVICE_TYPE}`,
  "",
  "",
].join("\r\n");

/** Discovery debug logging — on by default, silence with DEBUG_DISCOVERY=false */
const DEBUG = process.env.DEBUG_DISCOVERY !== "false";
function dbg(...args: unknown[]) {
  if (DEBUG) console.log("[ssdp]", ...args);
}

/**
 * Returns a list of IP addresses that responded to the M-SEARCH.
 */
export function discoverViaSsdp(
  timeoutMs = Number(process.env.SSDP_TIMEOUT_MS) || 4000
): Promise<string[]> {
  dbg(`Starting M-SEARCH for ${SAMSUNG_SERVICE_TYPE} (timeout ${timeoutMs}ms)`);
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const found = new Set<string>();
    let responseCount = 0;

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      responseCount++;
      // Only accept Samsung TV SSDP responses
      if (
        text.includes("samsung") ||
        text.includes("Samsung") ||
        text.includes(SAMSUNG_SERVICE_TYPE)
      ) {
        if (!found.has(rinfo.address)) {
          dbg(`Samsung SSDP response from ${rinfo.address}:${rinfo.port}`);
        }
        found.add(rinfo.address);
      } else {
        // Non-matching response — log first line so we can see if the TV
        // replies but its payload doesn't match our filter.
        const firstLine = text.split("\r\n")[0];
        dbg(`Ignored SSDP response from ${rinfo.address} (no Samsung match): ${firstLine}`);
      }
    });

    socket.on("error", (err) => {
      console.warn("[ssdp] socket error:", err.message);
      socket.close();
      resolve([...found]);
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(4);
        const bound = socket.address();
        dbg(`Socket bound on ${bound.address}:${bound.port}`);

        // Send M-SEARCH on each network interface
        const interfaces = os.networkInterfaces();
        const ipv4Ifaces: string[] = [];
        for (const [name, iface] of Object.entries(interfaces)) {
          for (const addr of iface ?? []) {
            if (addr.family === "IPv4" && !addr.internal) {
              ipv4Ifaces.push(`${name}=${addr.address}`);
              try {
                socket.setMulticastInterface(addr.address);
              } catch (e) {
                // Some interfaces don't support multicast — skip
                dbg(`setMulticastInterface failed for ${name} (${addr.address}): ${(e as Error).message}`);
              }
            }
          }
        }
        dbg(`Sending M-SEARCH over IPv4 interfaces: ${ipv4Ifaces.join(", ") || "(none found!)"}`);

        const buf = Buffer.from(MSEARCH_PACKET);
        socket.send(buf, 0, buf.length, SSDP_PORT, SSDP_MULTICAST_ADDR, (e) => {
          if (e) console.warn("[ssdp] send callback error:", e.message);
          else dbg(`M-SEARCH packet sent to ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}`);
        });
      } catch (e) {
        console.warn("[ssdp] send error:", e);
      }
    });

    setTimeout(() => {
      try {
        socket.close();
      } catch {
        // already closed
      }
      dbg(`Done. ${responseCount} total response(s), ${found.size} Samsung TV(s): ${[...found].join(", ") || "none"}`);
      resolve([...found]);
    }, timeoutMs);
  });
}
