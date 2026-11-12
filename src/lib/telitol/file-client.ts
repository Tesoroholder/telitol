import {
  finishAttachmentUpload,
  startAttachmentUpload,
} from "@/lib/telitol/attachment-server";
import type { UploadedAttachment } from "@/lib/telitol/shared";

const BLOB_API = "https://vercel.com/api/blob";

/**
 * Upload one file: get a one-file pass from our server, send the file
 * straight to storage (with progress), then have our server check and
 * record it. Throws with a readable message.
 */
export async function uploadFile(
  file: File,
  purpose: "question" | "answer" | "ai",
  onProgress?: (fraction: number) => void,
): Promise<UploadedAttachment> {
  const start = await startAttachmentUpload({
    data: { purpose, name: file.name, size: file.size },
  });
  if (!start.ok) throw new Error(start.error);

  const stored = await new Promise<{ url: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${BLOB_API}/?${new URLSearchParams({ pathname: start.pathname })}`);
    xhr.setRequestHeader("authorization", `Bearer ${start.token}`);
    xhr.setRequestHeader("x-api-version", start.apiVersion);
    xhr.setRequestHeader("x-vercel-blob-store-id", start.storeId);
    xhr.setRequestHeader("x-vercel-blob-access", "public");
    xhr.setRequestHeader("x-content-type", start.contentType);
    xhr.setRequestHeader("x-content-length", String(file.size));
    xhr.setRequestHeader("x-add-random-suffix", "0");
    xhr.setRequestHeader("x-cache-control-max-age", "31536000");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { url?: string };
          if (body.url) return resolve({ url: body.url });
        } catch {
          // fall through
        }
      }
      reject(new Error("The upload didn't finish. Check your connection and try again."));
    };
    xhr.onerror = () =>
      reject(new Error("The upload didn't finish. Check your connection and try again."));
    xhr.send(file);
  });

  onProgress?.(1);
  const done = await finishAttachmentUpload({
    data: { purpose, name: file.name, url: stored.url },
  });
  if (!done.ok) throw new Error(done.error);
  return done.file;
}
