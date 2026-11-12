import { env } from "@/lib/env.server";

/**
 * Minimal Vercel Blob client over its HTTP API (the same calls the official
 * @vercel/blob package makes), so no extra dependency is needed.
 *
 * Setup: Vercel → project → Storage → Create → Blob (public access), connected
 * to this project. Vercel then sets BLOB_READ_WRITE_TOKEN.
 */

const API_URL = "https://vercel.com/api/blob";
const API_VERSION = "13";

function token(): string | null {
  const value = env("BLOB_READ_WRITE_TOKEN")?.trim();
  return value && value.startsWith("vercel_blob_rw_") ? value : null;
}

/** True when photo uploads can work on this deployment. */
export function blobConfigured(): boolean {
  return token() !== null;
}

function headers(rw: string): Record<string, string> {
  // Token format: vercel_blob_rw_<storeId>_<secret>
  const storeId = rw.split("_")[3] ?? "";
  return {
    authorization: `Bearer ${rw}`,
    "x-api-version": API_VERSION,
    "x-vercel-blob-store-id": storeId,
  };
}

/** Upload a public file. Returns its URL and pathname, or throws with a readable reason. */
export async function putBlob(
  pathname: string,
  body: Uint8Array,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const rw = token();
  if (!rw) throw new Error("Photo uploads aren't set up yet.");
  const res = await fetch(`${API_URL}/?${new URLSearchParams({ pathname })}`, {
    method: "PUT",
    headers: {
      ...headers(rw),
      "x-vercel-blob-access": "public",
      "x-content-type": contentType,
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": "31536000",
    },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[blob] upload failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
    throw new Error("Couldn't save that photo. Try again in a moment.");
  }
  const data = (await res.json()) as { url?: string; pathname?: string };
  if (!data.url) throw new Error("Couldn't save that photo. Try again in a moment.");
  return { url: data.url, pathname: data.pathname ?? pathname };
}

/** Delete files by URL. Best effort: failures are logged, never thrown. */
export async function deleteBlobs(urls: string[]): Promise<void> {
  const rw = token();
  if (!rw || urls.length === 0) return;
  for (let i = 0; i < urls.length; i += 100) {
    try {
      const res = await fetch(`${API_URL}/delete`, {
        method: "POST",
        headers: { ...headers(rw), "content-type": "application/json" },
        body: JSON.stringify({ urls: urls.slice(i, i + 100) }),
      });
      if (!res.ok)
        console.error(`[blob] delete failed (HTTP ${res.status}) for ${urls.length} file(s)`);
    } catch (err) {
      console.error("[blob] delete failed:", err);
    }
  }
}
