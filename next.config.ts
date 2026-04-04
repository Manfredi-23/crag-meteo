import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  // Static export for Capacitor iOS builds
  ...(isStaticExport && { output: 'export' }),
};

export default nextConfig;
