/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ensure bcryptjs and prisma are treated as server-only externals.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
