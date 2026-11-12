import type { Sql } from "../db.ts";
import type { ImageRef } from "./shared.ts";

/**
 * Photo uploads: rules, database bookkeeping and the SQL that reads photos
 * back. Plain functions over `Sql` (no aliases) so tests can run them against
 * a real database. Storing the bytes in Vercel Blob is in blob.server.ts.
 */

export type ImagePurpose = "question" | "answer" | "avatar" | "connect";

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return (
    value === "question" ||
    value === "answer" ||
    value === "avatar" ||
    value === "connect"
  );
}

/** Most photos per post. */
export const MAX_IMAGES: Record<ImagePurpose, number> = {
  question: 4,
  answer: 2,
  avatar: 1,
  connect: 1,
};

/** Upper bound on one uploaded file, after the app has resized it. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Longest side the app resizes photos to (avatars are smaller). */
export const MAX_IMAGE_SIDE = 1600;
export const AVATAR_SIDE = 512;

/** Unused uploads (never attached, or whose post is gone) are removed after this. */
export const ORPHAN_HOURS = 24;

export type SniffedImage = { contentType: string; extension: string };

/** Identify JPEG, PNG or WebP from the file's first bytes; anything else is refused. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { contentType: "image/jpeg", extension: "jpg" };
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { contentType: "image/png", extension: "png" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { contentType: "image/webp", extension: "webp" };
  return null;
}

/** Keep reported dimensions sane; they only shape the layout. */
export function clampDimension(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(4096, Math.max(1, n)) : 1;
}

export async function recordImage(
  sql: Sql,
  input: {
    userId: string;
    url: string;
    pathname: string;
    width: number;
    height: number;
    bytes: number;
    purpose: ImagePurpose;
  },
): Promise<ImageRef & { id: number }> {
  const rows = await sql<{ id: number }>`
    insert into images (user_id, url, pathname, width, height, bytes, purpose)
    values (${input.userId}, ${input.url}, ${input.pathname}, ${input.width},
            ${input.height}, ${input.bytes}, ${input.purpose})
    returning id
  `;
  return {
    id: Number(rows[0]?.id),
    url: input.url,
    width: input.width,
    height: input.height,
  };
}

/** Clean list of ids: integers, no repeats, in the order given. */
export function cleanImageIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids;
}

/**
 * Check photos can be attached: each was uploaded by this member for this
 * kind of post, and isn't already used somewhere else (`exceptQuestionId` /
 * `exceptAnswerId` allow the post's own photos when editing it).
 */
export async function checkImages(
  sql: Sql,
  userId: string,
  purpose: ImagePurpose,
  ids: number[],
  except: { questionId?: number; answerId?: number } = {},
): Promise<string | null> {
  if (ids.length === 0) return null;
  if (ids.length > MAX_IMAGES[purpose])
    return `You can add up to ${MAX_IMAGES[purpose]} photo${MAX_IMAGES[purpose] === 1 ? "" : "s"}.`;
  const rows = await sql.query<{ id: number; in_use: unknown }>(
    `select i.id,
       (exists (select 1 from question_images qi where qi.image_id = i.id and qi.question_id <> $4)
        or exists (select 1 from answer_images ai where ai.image_id = i.id and ai.answer_id <> $5)
        or exists (select 1 from profiles p where p.avatar_image_id = i.id)
        or exists (select 1 from connect_messages m where m.image_id = i.id)) as in_use
     from images i
     where i.id = any($1::int[]) and i.user_id = $2 and i.purpose = $3`,
    [`{${ids.join(",")}}`, userId, purpose, except.questionId ?? 0, except.answerId ?? 0],
  );
  if (rows.length !== ids.length) return "One of those photos isn't available. Add it again.";
  if (rows.some((row) => row.in_use === true || row.in_use === "t" || row.in_use === "true"))
    return "One of those photos is already used elsewhere. Add it again.";
  return null;
}

/** Replace a question's photos with `ids`, in order. Call `checkImages` first. */
export async function setQuestionImages(
  sql: Sql,
  questionId: number,
  ids: number[],
): Promise<void> {
  await sql`delete from question_images where question_id = ${questionId}`;
  for (const [position, imageId] of ids.entries()) {
    await sql`
      insert into question_images (question_id, image_id, position)
      values (${questionId}, ${imageId}, ${position})
    `;
  }
}

/** Attach photos to a new answer, in order. Call `checkImages` first. */
export async function setAnswerImages(
  sql: Sql,
  answerId: number,
  ids: number[],
): Promise<void> {
  await sql`delete from answer_images where answer_id = ${answerId}`;
  for (const [position, imageId] of ids.entries()) {
    await sql`
      insert into answer_images (answer_id, image_id, position)
      values (${answerId}, ${imageId}, ${position})
    `;
  }
}

/** JSON array of a question's photos, for use inside a select (alias q). */
export const QUESTION_IMAGES_SQL = `coalesce((
    select json_agg(json_build_object('id', i.id, 'url', i.url, 'width', i.width, 'height', i.height) order by qi.position)
    from question_images qi join images i on i.id = qi.image_id
    where qi.question_id = q.id
  ), '[]'::json)`;

/** JSON array of an answer's photos, for use inside a select (alias a). */
export const ANSWER_IMAGES_SQL = `coalesce((
    select json_agg(json_build_object('id', i.id, 'url', i.url, 'width', i.width, 'height', i.height) order by ai.position)
    from answer_images ai join images i on i.id = ai.image_id
    where ai.answer_id = a.id
  ), '[]'::json)`;

/** A member's profile photo URL, for use inside a select (profiles alias p). */
export const AVATAR_URL_SQL = `(select i.url from images i where i.id = p.avatar_image_id)`;

/** Photos as returned by the database driver (parsed JSON or a JSON string). */
export function parseImages(value: unknown): ImageRef[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is { id?: unknown; url: string; width: unknown; height: unknown } =>
        !!item && typeof (item as { url?: unknown }).url === "string",
    )
    .map((item) => {
      const id = Number(item.id);
      return {
        ...(Number.isInteger(id) && id > 0 ? { id } : {}),
        url: item.url,
        width: clampDimension(item.width),
        height: clampDimension(item.height),
      };
    });
}

/**
 * Remove image rows nobody uses any more (abandoned uploads, photos of
 * deleted posts, expired Connect chats) and return their URLs so the files
 * can be deleted from storage. Small batches keep each call cheap.
 */
export async function sweepOrphanImages(sql: Sql, limit = 50): Promise<string[]> {
  const rows = await sql<{ url: string }>`
    delete from images
    where id in (
      select i.id from images i
      where i.created_at < now() - make_interval(hours => ${ORPHAN_HOURS}::int)
        and not exists (select 1 from question_images qi where qi.image_id = i.id)
        and not exists (select 1 from answer_images ai where ai.image_id = i.id)
        and not exists (select 1 from profiles p where p.avatar_image_id = i.id)
        and not exists (select 1 from connect_messages m where m.image_id = i.id)
      order by i.created_at
      limit ${limit}
    )
    returning url
  `;
  return rows.map((row) => row.url);
}

/** URLs of every photo a member uploaded (for account deletion). */
export async function imageUrlsOf(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ url: string }>`select url from images where user_id = ${userId}`;
  return rows.map((row) => row.url);
}
