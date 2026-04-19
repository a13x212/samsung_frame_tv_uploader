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

/**
 * Returns a list of IP addresses that responded to the M-SEARCH.
 */
export function discoverViaSsdp(
  timeoutMs = Number(process.env.SSDP_TIMEOUT_MS) || 4000
): Promise<string[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const found = new Set<string>();

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      // Only accept Samsung TV SSDP responses
      if (
        text.includes("samsung") ||
        text.includes("Samsung") ||
        text.includes(SAMSUNG_SERVICE_TYPE)
      ) {
        found.add(rinfo.address);
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

        // Send M-SEARCH on each network interface
        const interfaces = os.networkInterfaces();
        for (const iface of Object.values(interfaces)) {
          for (const addr of iface ?? []) {
            if (addr.family === "IPv4" && !addr.internal) {
              try {
                socket.setMulticastInterface(addr.address);
              } catch {
                // Some interfaces don't support multicast — skip
              }
            }
          }
        }

        const buf = Buffer.from(MSEARCH_PACKET);
        socket.send(buf, 0, buf.length, SSDP_PORT, SSDP_MULTICAST_ADDR);
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
      resolve([...found]);
    }, timeoutMs);
  });
}
