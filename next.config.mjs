/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
