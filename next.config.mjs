/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ensure bcryptjs, prisma, and the CSV parser are treated as server-only.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "csv-parse"],
};

export default nextConfig;
