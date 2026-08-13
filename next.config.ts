import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["192.168.0.120"],
  images: {
    qualities: [72, 75],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
