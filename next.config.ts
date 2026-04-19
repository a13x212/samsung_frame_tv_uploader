import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server handles routing — disable built-in server
  // Required for SSDP (UDP) and direct TV WebSocket connections
};

export default nextConfig;
