import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server handles routing — disable built-in server
  // Required for SSDP (UDP) and direct TV WebSocket connections

  // The app never uses next/image. Disabling optimization removes the
  // /_next/image optimizer endpoint entirely, which recent RCE advisories target.
  images: { unoptimized: true },
};

export default nextConfig;
