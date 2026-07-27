import { config as loadEnv } from "dotenv";

// Load .env BEFORE any module that reads validated env (src/env.ts). This is a
// no-op when the platform (e.g. Railway) injects real environment variables.
loadEnv();

// Dynamic import so env validation runs after dotenv has populated process.env.
void import("./run");
