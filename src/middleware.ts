import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Use the edge-safe config (no Prisma) for route protection in middleware.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except Next internals and API routes.
  // API routes (auth handler + public health checks) manage their own access.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
