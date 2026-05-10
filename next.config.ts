import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["snekpi", "snekpi.local", "192.168.1.94"],
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    useLightningcss: true,
  },
};

export default nextConfig;
