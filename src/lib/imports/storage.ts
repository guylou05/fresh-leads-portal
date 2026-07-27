import crypto from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { importTempDir } from "@/lib/imports/config";

/**
 * Sanitize a user-supplied file name for safe display/storage:
 * strips any directory components (traversal protection) and disallows unusual
 * characters. This value is used ONLY for display; it never forms a disk path.
 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "upload";
}

/** Derive a lowercase extension (including the dot) from a file name. */
export function fileExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

/** SHA-256 checksum of file bytes, as lowercase hex. */
export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Generate an opaque, collision-resistant stored file name. */
export function generateStoredFileName(extension: string): string {
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".dat";
  return `${crypto.randomUUID()}${safeExt}`;
}

/**
 * Resolve a stored file name to an absolute path inside the temp dir, refusing
 * anything that would escape it (defense-in-depth against traversal).
 */
function resolveTempPath(storedFileName: string): string {
  const dir = path.resolve(importTempDir());
  const resolved = path.resolve(dir, storedFileName);
  if (resolved !== path.join(dir, path.basename(storedFileName))) {
    throw new Error("Invalid stored file name");
  }
  return resolved;
}

export async function writeTempFile(
  storedFileName: string,
  buffer: Buffer,
): Promise<void> {
  const dir = importTempDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolveTempPath(storedFileName), buffer);
}

export function tempFileStream(storedFileName: string): Readable {
  return createReadStream(resolveTempPath(storedFileName));
}

export async function tempFileExists(storedFileName: string): Promise<boolean> {
  try {
    await fs.access(resolveTempPath(storedFileName));
    return true;
  } catch {
    return false;
  }
}

/** Best-effort cleanup of a temporary upload. Never throws. */
export async function deleteTempFile(
  storedFileName: string | null | undefined,
): Promise<void> {
  if (!storedFileName) return;
  try {
    await fs.unlink(resolveTempPath(storedFileName));
  } catch {
    /* already gone or never written — nothing to do */
  }
}
