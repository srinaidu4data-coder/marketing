import path from "path";
import os from "os";

/**
 * Writable root for resume files.
 * - Local/dev: <cwd>/uploads
 * - Vercel/serverless: /tmp/roleforge-uploads (only writable dir)
 */
export function getUploadRoot(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "roleforge-uploads");
  }
  return path.join(process.cwd(), "uploads");
}

export function chainUploadDir(chainId: string): string {
  return path.join(getUploadRoot(), "chains", chainId);
}

export function masterUploadDir(): string {
  return path.join(getUploadRoot(), "masters");
}

/** Resolve a stored relative path (uploads/...) or absolute /tmp path for reading. */
export function resolveUploadPath(stored: string): string {
  if (path.isAbsolute(stored)) return stored;
  // Historical paths: uploads/chains/... relative to cwd
  if (stored.startsWith("uploads/") || stored.startsWith("uploads\\")) {
    const underTmp = path.join(os.tmpdir(), "roleforge-uploads", stored.replace(/^uploads[/\\]/, ""));
    const underCwd = path.join(process.cwd(), stored);
    // Prefer tmp on Vercel
    if (process.env.VERCEL) return underTmp;
    return underCwd;
  }
  return path.join(process.cwd(), stored);
}
