import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  allowedDevOrigins: [
    "192.168.20.99",
    "192.168.20.99:3000",
    "192.168.20.99:3001",
    "localhost:3000",
    "localhost:3001",
    "127.0.0.1:3000",
    "127.0.0.1:3001"
  ],
};

export default nextConfig;
