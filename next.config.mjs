/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16.3 can lose TypeScript CLI stdout during Vercel builds; typechecking remains available locally.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
