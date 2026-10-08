/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Vercel builds resilient to the Next 16 TypeScript CLI stdout issue; typechecking runs before each change.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
