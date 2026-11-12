/**
 * Prepare a photo in the browser before upload: shrink it, turn it the right
 * way up, and re-encode it as JPEG. Redrawing on a canvas also drops all
 * metadata, including GPS location, so it never reaches the server.
 */

export type PreparedImage = { data: string; width: number; height: number };

/** Biggest original we'll try to read (phone cameras can exceed 10 MB). */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Couldn't read that photo."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: File, maxSide: number): Promise<PreparedImage> {
  if (!file.type.startsWith("image/") && file.type !== "")
    throw new Error("That file isn't a photo.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That photo is too large.");

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error("This photo format isn't supported. Try a JPEG or PNG.");
  }
  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) throw new Error("Couldn't read that photo.");

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare that photo.");
  // White behind transparent PNGs, since JPEG has no transparency.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) throw new Error("Couldn't prepare that photo.");
  return { data: await toBase64(blob), width, height };
}
