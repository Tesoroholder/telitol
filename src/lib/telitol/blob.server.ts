import { createHmac } from "node:crypto";
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

/**
 * A short-lived pass that lets the browser upload one file straight to
 * storage (large videos can't go through our server). It only works for this
 * exact pathname, this content type and up to this size. Same format as
 * @vercel/blob's generateClientTokenFromReadWriteToken.
 */
export function createUploadToken(options: {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  validForMinutes?: number;
}): { token: string; storeId: string; apiVersion: string } | null {
  const rw = token();
  if (!rw) return null;
  const storeId = rw.split("_")[3] ?? "";
  const payload = Buffer.from(
    JSON.stringify({
      pathname: options.pathname,
      allowedContentTypes: [options.contentType],
      maximumSizeInBytes: options.maximumSizeInBytes,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31536000,
      validUntil: Date.now() + (options.validForMinutes ?? 30) * 60_000,
    }),
  ).toString("base64");
  const signature = createHmac("sha256", rw).update(payload).digest("hex");
  return {
    token: `vercel_blob_client_${storeId}_${Buffer.from(`${signature}.${payload}`).toString("base64")}`,
    storeId,
    apiVersion: API_VERSION,
  };
}

/** Facts storage holds about an uploaded file, or null if it isn't there. */
export async function headBlob(
  url: string,
): Promise<{ url: string; pathname: string; size: number; contentType: string } | null> {
  const rw = token();
  if (!rw) return null;
  const res = await fetch(`${API_URL}/?${new URLSearchParams({ url })}`, {
    method: "GET",
    headers: headers(rw),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    url?: string;
    pathname?: string;
    size?: number;
    contentType?: string;
  };
  if (!data.url || !data.pathname) return null;
  return {
    url: data.url,
    pathname: data.pathname,
    size: Number(data.size ?? 0),
    contentType: data.contentType ?? "",
  };
}

/** Download up to `maxBytes` of a stored file (its first bytes when `maxBytes` is small). */
export async function readBlob(url: string, maxBytes: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { range: `bytes=0-${maxBytes - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  return body.length > maxBytes ? body.slice(0, maxBytes) : body;
}
