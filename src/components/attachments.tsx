import { useId, useState, type ChangeEvent } from "react";
import { ErrorNote } from "@/components/fields";
import { usePhotoSupport } from "@/components/photos";
import { acceptList, FILE_TYPES, extensionOf, formatBytes } from "@/lib/telitol/attachments";
import { uploadFile } from "@/lib/telitol/file-client";
import type { Attachment, UploadedAttachment } from "@/lib/telitol/shared";

type Pending = { key: string; name: string; progress: number };

/** "Attach file" button, upload progress, and the files attached so far. */
export function AttachmentPicker({
  purpose,
  value,
  onChange,
  max,
  label = "Attach file",
}: {
  purpose: "question" | "answer" | "ai";
  value: UploadedAttachment[];
  onChange: (files: UploadedAttachment[]) => void;
  max: number;
  label?: string;
}) {
  // Same storage as photos, so the same "is it set up" check.
  const supported = usePhotoSupport();
  const inputId = useId();
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState("");

  if (!supported && value.length === 0) return null;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const room = max - value.length - pending.length;
    if (files.length > room)
      setError(`You can attach up to ${max} file${max === 1 ? "" : "s"}.`);
    let next = value;
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPending((list) => [...list, { key, name: file.name, progress: 0 }]);
      try {
        const uploaded = await uploadFile(file, purpose, (progress) =>
          setPending((list) => list.map((p) => (p.key === key ? { ...p, progress } : p))),
        );
        next = [...next, uploaded];
        onChange(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't attach that file.");
      } finally {
        setPending((list) => list.filter((p) => p.key !== key));
      }
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 || pending.length > 0 ? (
        <ul className="space-y-2">
          {value.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              <FileChip file={file} />
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item.id !== file.id))}
                className="shrink-0 text-sm font-medium text-muted hover:text-ink"
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
            </li>
          ))}
          {pending.map((item) => (
            <li
              key={item.key}
              className="rounded-2xl border border-line bg-card px-3 py-2 text-sm"
            >
              <p className="truncate font-medium">{item.name}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mint">
                <div
                  className="h-full bg-green transition-[width]"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted tabular-nums">
                {item.progress < 1
                  ? `Uploading… ${Math.round(item.progress * 100)}%`
                  : purpose === "ai"
                    ? "Reading the file…"
                    : "Checking the file…"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {supported && value.length + pending.length < max ? (
        <label
          htmlFor={inputId}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink"
        >
          <PaperclipIcon />
          {label}
          {max > 1 ? (
            <span className="font-normal text-muted">
              ({value.length}/{max})
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        id={inputId}
        type="file"
        accept={acceptList(purpose)}
        multiple={max - value.length > 1}
        className="sr-only"
        onChange={(event) => void onFiles(event)}
      />
      <ErrorNote message={error} />
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.4 11.6-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
    </svg>
  );
}

/** A document as a tappable card: type, name, size. Opens or downloads the file. */
export function FileChip({ file }: { file: Attachment }) {
  const type = FILE_TYPES[extensionOf(file.name)];
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-xs font-bold uppercase text-green-deep">
        {extensionOf(file.name) || "file"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block text-xs text-muted">
          {type?.label ?? "File"} · {formatBytes(file.bytes)}
        </span>
      </span>
    </a>
  );
}

/** Files attached to a post: documents as cards, audio and video playable in place. */
export function AttachmentList({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.url}>
          {file.kind === "audio" ? (
            <div className="space-y-1 rounded-2xl border border-line bg-card p-3">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <audio controls preload="metadata" src={file.url} className="w-full">
                <a href={file.url}>Download {file.name}</a>
              </audio>
            </div>
          ) : file.kind === "video" ? (
            <div className="space-y-1">
              <video
                controls
                preload="metadata"
                playsInline
                src={file.url}
                className="max-h-96 w-full rounded-2xl border border-line bg-ink"
              >
                <a href={file.url}>Download {file.name}</a>
              </video>
              <p className="truncate text-xs text-muted">
                {file.name} · {formatBytes(file.bytes)}
              </p>
            </div>
          ) : (
            <FileChip file={file} />
          )}
        </li>
      ))}
    </ul>
  );
}
