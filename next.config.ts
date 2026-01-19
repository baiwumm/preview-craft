import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [new URL('https://iad.microlink.io/**'), new URL('https://cdn.baiwumm.com/**')],
  },
};

export default nextConfig;
