/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ensure server-only packages are not bundled for the client/edge.
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "csv-parse",
    "bullmq",
    "ioredis",
    "cheerio",
    "openai",
  ],
};

export default nextConfig;
