import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add your device hostname/IP here for dev access, e.g. ["mypi", "mypi.local", "192.168.1.x"]
  allowedDevOrigins: ["localhost"],
  serverExternalPackages: ["better-sqlite3", "onvif"],
  experimental: {
    useLightningcss: true,
  },
};

export default nextConfig;
