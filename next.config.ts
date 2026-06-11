import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "21.0.20.209",
    "localhost",
    ".space-z.ai",
  ],
};

export default nextConfig;
