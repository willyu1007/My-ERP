/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the @my-erp/ui workbench kit (TS/TSX + CSS) directly from source.
  transpilePackages: ['@my-erp/ui'],
  // Linting runs as its own root step (pnpm lint); don't fail the build on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
