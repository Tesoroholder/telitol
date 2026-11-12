import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { suspensionMessage } from "@/lib/telitol/moderation";
import { allowAction, SLOW_DOWN } from "@/lib/telitol/rate-limit";
import { blobConfigured, deleteBlobs, putBlob } from "@/lib/telitol/blob.server";
import {
  checkImages,
  clampDimension,
  isImagePurpose,
  MAX_IMAGE_BYTES,
  recordImage,
  sniffImage,
  sweepOrphanImages,
} from "@/lib/telitol/images";
import type { UploadedImage } from "@/lib/telitol/shared";

type Err = { ok: false; error: string };

/** Whether the upload buttons should show (storage is configured). */
export const getPhotoSupport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<boolean> => blobConfigured());

/**
 * Upload one photo. The app has already resized it and stripped its metadata
 * (including location) by redrawing it; the server checks it really is a
 * JPEG, PNG or WebP under the size limit before storing it.
 */
export const uploadImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { purpose?: string; data?: string; width?: number; height?: number }) => ({
      purpose: isImagePurpose(input?.purpose) ? input.purpose : null,
      data: typeof input?.data === "string" ? input.data : "",
      width: clampDimension(input?.width),
      height: clampDimension(input?.height),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; image: UploadedImage } | Err> => {
    if (!data.purpose) return { ok: false, error: "That photo can't go there." };
    if (!blobConfigured()) return { ok: false, error: "Photo uploads aren't set up yet." };
    const sql = await getSql();
    const suspended = await suspensionMessage(sql, context.userId);
    if (suspended) return { ok: false, error: suspended };
    if (!(await allowAction(sql, "imageUpload", context.userId)))
      return { ok: false, error: SLOW_DOWN };

    // base64 is 4/3 the size of the bytes; reject oversized input before decoding.
    if (data.data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4)
      return { ok: false, error: "That photo is too large." };
    const bytes = new Uint8Array(Buffer.from(data.data, "base64"));
    if (bytes.length === 0) return { ok: false, error: "That photo is empty." };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "That photo is too large." };
    const kind = sniffImage(bytes);
    if (!kind) return { ok: false, error: "Use a JPEG, PNG or WebP photo." };

    try {
      // Random names only: a member's id never appears in a public link.
      const stored = await putBlob(
        `${data.purpose}/${randomUUID()}.${kind.extension}`,
        bytes,
        kind.contentType,
      );
      const image = await recordImage(sql, {
        userId: context.userId,
        url: stored.url,
        pathname: stored.pathname,
        width: data.width,
        height: data.height,
        bytes: bytes.length,
        purpose: data.purpose,
      });
      // Tidy up a few abandoned uploads while we're here.
      void sweepOrphanImages(sql, 20)
        .then(deleteBlobs)
        .catch(() => {});
      return { ok: true, image };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't save that photo.",
      };
    }
  });

/** Set (or with null, remove) your profile photo. */
export const setProfilePhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageId?: number | null }) => ({
    imageId:
      input?.imageId === null || input?.imageId === undefined
        ? null
        : Number(input.imageId),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    const sql = await getSql();
    if (data.imageId !== null) {
      if (!Number.isInteger(data.imageId) || data.imageId <= 0)
        return { ok: false, error: "That photo isn't available." };
      const invalid = await checkImages(sql, context.userId, "avatar", [data.imageId]);
      if (invalid) return { ok: false, error: invalid };
    }
    await sql`update profiles set avatar_image_id = ${data.imageId} where user_id = ${context.userId}`;
    return { ok: true };
  });
