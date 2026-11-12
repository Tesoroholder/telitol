import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { suspensionMessage } from "@/lib/telitol/moderation";
import { allowAction, SLOW_DOWN } from "@/lib/telitol/rate-limit";
import {
  blobConfigured,
  createUploadToken,
  deleteBlobs,
  headBlob,
  readBlob,
} from "@/lib/telitol/blob.server";
import {
  checkUploadRequest,
  cleanFileName,
  contentMatches,
  extensionOf,
  FILE_TYPES,
  isAttachmentPurpose,
  isOurPathname,
  MAX_AI_BYTES,
  MAX_BYTES,
  newPathname,
  recordAttachment,
  sweepOrphanAttachments,
} from "@/lib/telitol/attachments";
import { extractText } from "@/lib/telitol/doc-text";
import type { UploadedAttachment } from "@/lib/telitol/shared";

type Err = { ok: false; error: string };

/**
 * Step 1 of an upload: check the file is allowed, then hand the browser a
 * pass to upload exactly this file straight to storage.
 */
export const startAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { purpose?: string; name?: string; size?: number }) => ({
    purpose: isAttachmentPurpose(input?.purpose) ? input.purpose : null,
    name: cleanFileName(typeof input?.name === "string" ? input.name : ""),
    size: Number(input?.size),
  }))
  .handler(
    async ({
      context,
      data,
    }): Promise<
      | {
          ok: true;
          pathname: string;
          contentType: string;
          token: string;
          storeId: string;
          apiVersion: string;
        }
      | Err
    > => {
      if (!data.purpose) return { ok: false, error: "Files can't be attached there." };
      if (!blobConfigured()) return { ok: false, error: "File uploads aren't set up yet." };
      const allowed = checkUploadRequest(data.purpose, data.name, data.size);
      if (!allowed.ok) return allowed;
      const sql = await getSql();
      const suspended = await suspensionMessage(sql, context.userId);
      if (suspended) return { ok: false, error: suspended };
      if (!(await allowAction(sql, "fileUpload", context.userId)))
        return { ok: false, error: SLOW_DOWN };

      const pathname = newPathname(data.purpose, randomUUID(), allowed.type.extension);
      const pass = createUploadToken({
        pathname,
        contentType: allowed.type.contentType,
        maximumSizeInBytes:
          data.purpose === "ai" ? MAX_AI_BYTES : MAX_BYTES[allowed.type.kind],
      });
      if (!pass) return { ok: false, error: "File uploads aren't set up yet." };
      return { ok: true, pathname, contentType: allowed.type.contentType, ...pass };
    },
  );

/**
 * Step 2: after the browser uploads, confirm the file is really there, really
 * is what its name says (first bytes checked), and record it. Files that fail
 * are deleted from storage. Documents for the AI also have their text read.
 */
export const finishAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { purpose?: string; name?: string; url?: string }) => ({
    purpose: isAttachmentPurpose(input?.purpose) ? input.purpose : null,
    name: cleanFileName(typeof input?.name === "string" ? input.name : ""),
    url: typeof input?.url === "string" ? input.url : "",
  }))
  .handler(
    async ({ context, data }): Promise<{ ok: true; file: UploadedAttachment } | Err> => {
      if (!data.purpose) return { ok: false, error: "Files can't be attached there." };
      if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(data.url))
        return { ok: false, error: "That upload didn't finish. Try again." };
      const stored = await headBlob(data.url);
      if (!stored || !isOurPathname(data.purpose, stored.pathname))
        return { ok: false, error: "That upload didn't finish. Try again." };

      const extension = extensionOf(stored.pathname);
      const type = FILE_TYPES[extension];
      const limit = data.purpose === "ai" ? MAX_AI_BYTES : type ? MAX_BYTES[type.kind] : 0;
      const reject = async (error: string): Promise<Err> => {
        await deleteBlobs([stored.url]);
        return { ok: false, error };
      };
      if (!type || stored.size <= 0 || stored.size > limit)
        return reject("That file isn't allowed.");

      let head: Uint8Array;
      try {
        head = await readBlob(stored.url, 4096);
      } catch {
        return { ok: false, error: "Couldn't check that file. Try again." };
      }
      if (!contentMatches(extension, head))
        return reject(`That file isn't a real ${type.label} file.`);

      let extractedText: string | null = null;
      if (data.purpose === "ai") {
        try {
          extractedText = await extractText(extension, await readBlob(stored.url, MAX_AI_BYTES));
        } catch {
          extractedText = "";
        }
        if (!extractedText || extractedText.length < 20)
          return reject(
            "TeliTol AI couldn't find any text in that file. Scanned pages and photos of text can't be read yet.",
          );
      }

      const sql = await getSql();
      // Use the file name the member chose, but the extension we checked.
      const name = extensionOf(data.name) === extension ? data.name : `${data.name}.${extension}`;
      try {
        const file = await recordAttachment(sql, {
          userId: context.userId,
          url: stored.url,
          pathname: stored.pathname,
          name,
          contentType: type.contentType,
          kind: type.kind,
          bytes: stored.size,
          purpose: data.purpose,
          extractedText,
        });
        void sweepOrphanAttachments(sql, 20)
          .then(deleteBlobs)
          .catch(() => {});
        return { ok: true, file };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Couldn't save that file.",
        };
      }
    },
  );
