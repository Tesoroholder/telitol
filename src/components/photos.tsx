import { useEffect, useId, useState, type ChangeEvent } from "react";
import { ErrorNote } from "@/components/fields";
import { prepareImage } from "@/lib/telitol/image-client";
import { getPhotoSupport, uploadImage } from "@/lib/telitol/image-server";
import type { ImageRef, UploadedImage } from "@/lib/telitol/shared";

type Purpose = "question" | "answer" | "avatar" | "connect";

const MAX_SIDE: Record<Purpose, number> = {
  question: 1600,
  answer: 1600,
  avatar: 512,
  connect: 1280,
};

let supportPromise: Promise<boolean> | null = null;

/** Whether photo uploads are set up on the server (asked once per page load). */
export function usePhotoSupport(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let live = true;
    const support = (supportPromise ??= getPhotoSupport().catch(() => false));
    void support.then((value) => {
      if (live) setSupported(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return supported;
}

/** Resize, then upload one photo. Throws with a readable message. */
export async function uploadPhoto(file: File, purpose: Purpose): Promise<UploadedImage> {
  const prepared = await prepareImage(file, MAX_SIDE[purpose]);
  const result = await uploadImage({ data: { purpose, ...prepared } });
  if (!result.ok) throw new Error(result.error);
  return result.image;
}

/** "Add photo" button plus thumbnails of the photos attached so far. */
export function PhotoPicker({
  purpose,
  value,
  onChange,
  max,
}: {
  purpose: "question" | "answer";
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  max: number;
}) {
  const supported = usePhotoSupport();
  const inputId = useId();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  if (!supported && value.length === 0) return null;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const room = max - value.length;
    if (files.length > room) setError(`You can add up to ${max} photos.`);
    let next = value;
    for (const file of files.slice(0, Math.max(0, room))) {
      setUploading((n) => n + 1);
      try {
        const image = await uploadPhoto(file, purpose);
        next = [...next, image];
        onChange(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add that photo.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 || uploading > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((image, index) => (
            <li key={image.id} className="relative">
              <img
                src={image.url}
                alt={`Photo ${index + 1}`}
                className="size-20 rounded-xl border border-line object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item.id !== image.id))}
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-sm font-semibold text-on-ink"
                aria-label={`Remove photo ${index + 1}`}
              >
                ×
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <li
              key={`up-${i}`}
              className="grid size-20 animate-pulse place-items-center rounded-xl bg-mint text-xs text-muted"
            >
              Uploading…
            </li>
          ))}
        </ul>
      ) : null}
      {supported && value.length + uploading < max ? (
        <label
          htmlFor={inputId}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink"
        >
          <span aria-hidden="true">＋</span> Add photo
          <span className="font-normal text-muted">
            ({value.length}/{max})
          </span>
        </label>
      ) : null}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple={max - value.length > 1}
        className="sr-only"
        onChange={(event) => void onFiles(event)}
      />
      <ErrorNote message={error} />
    </div>
  );
}

/** Photos attached to a post. Tap one to open it full size. */
export function PhotoGallery({ images }: { images: ImageRef[] }) {
  if (images.length === 0) return null;
  const single = images.length === 1;
  return (
    <div className={single ? "" : "grid grid-cols-2 gap-2"}>
      {images.map((image, index) => (
        <a
          key={image.url}
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-2xl border border-line bg-mint"
        >
          <img
            src={image.url}
            alt={`Photo ${index + 1} of ${images.length}`}
            width={image.width}
            height={image.height}
            loading="lazy"
            className={`w-full object-cover ${single ? "max-h-[28rem]" : "aspect-square"}`}
          />
        </a>
      ))}
    </div>
  );
}

/** Round profile photo, or the first letter of the name when there isn't one. */
export function Avatar({
  url,
  name,
  size = 28,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        loading="lazy"
        className="inline-block shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-grid shrink-0 place-items-center rounded-full bg-mint font-semibold text-green-deep"
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
