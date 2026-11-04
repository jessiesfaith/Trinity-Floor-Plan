/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Identifies this build, so open tabs can tell when a newer version is deployed (see src/lib/freshVersion.ts).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev' },
  // Konva ships an optional Node "canvas" backend; never bundle it for the browser.
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
  turbopack: {
    resolveAlias: { canvas: './src/lib/empty-module.ts' },
  },
};
export default nextConfig;
