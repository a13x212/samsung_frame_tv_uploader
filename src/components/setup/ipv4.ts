/**
 * Client-side IPv4 check run before a manual address is sent. It mirrors the
 * server's isValidIPv4 (src/server/api-routes.ts), which stays the authority:
 * four dotted decimal octets 0-255, no leading zeros (so octal-looking input
 * such as 010.0.0.1 is refused), and no loopback, link-local, multicast or
 * "this network" ranges, which can never be a TV.
 *
 * Returns null when the address is acceptable, otherwise a message to show.
 */
export function ipv4Problem(raw: string): string | null {
  const ip = raw.trim();
  if (!ip) return "Enter your TV's IP address.";
  const parts = ip.split(".");
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^\d{1,3}$/.test(p) || /^0\d/.test(p) || Number(p) > 255)
  ) {
    return "That doesn't look like an IP address. Use four numbers separated by dots, like 192.168.1.100.";
  }
  const [a, b] = parts.map(Number);
  if (a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224) {
    return "That address can't belong to a TV. Check Settings > General > Network > Network Status on the TV.";
  }
  return null;
}
