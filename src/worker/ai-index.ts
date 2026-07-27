import { config as loadEnv } from "dotenv";

// Load .env before any module that reads validated env (no-op on Railway).
loadEnv();

void import("./ai-run");
