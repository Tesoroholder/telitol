import { useId, useState, type ChangeEvent } from "react";
import { Avatar, uploadPhoto, usePhotoSupport } from "@/components/photos";
import { ErrorNote } from "@/components/fields";
import { setProfilePhoto } from "@/lib/telitol/image-server";

/** Profile photo with Add/Change and Remove, for the You page header. */
export function ProfilePhoto({
  url,
  name,
  onChange,
}: {
  url: string | null;
  name: string;
  onChange: (url: string | null) => void;
}) {
  const supported = usePhotoSupport();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const image = await uploadPhoto(file, "avatar");
      const result = await setProfilePhoto({ data: { imageId: image.id } });
      if (!result.ok) throw new Error(result.error);
      onChange(image.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError("");
    setBusy(true);
    try {
      const result = await setProfilePhoto({ data: { imageId: null } });
      if (!result.ok) throw new Error(result.error);
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove your photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className={busy ? "animate-pulse" : ""}>
        <Avatar url={url} name={name} size={72} />
      </div>
      {supported ? (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-3">
            <label
              htmlFor={inputId}
              className="cursor-pointer text-sm font-semibold text-green hover:underline"
            >
              {busy ? "Saving…" : url ? "Change photo" : "Add profile photo"}
            </label>
            {url && !busy ? (
              <button
                type="button"
                onClick={() => void remove()}
                className="text-sm font-medium text-muted hover:text-ink"
              >
                Remove
              </button>
            ) : null}
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void onFile(event)}
          />
          <ErrorNote message={error} />
        </div>
      ) : null}
    </div>
  );
}
