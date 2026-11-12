import type { Sql } from "../db.ts";
import type { Attachment } from "./shared.ts";

/**
 * File attachments: which files are allowed, how big, how to recognise them
 * from their first bytes, and the database bookkeeping. Plain functions over
 * `Sql` (no aliases) so tests can run them against a real database.
 */

export type AttachmentKind = "document" | "audio" | "video";
export type AttachmentPurpose = "question" | "answer" | "ai";

export function isAttachmentPurpose(value: unknown): value is AttachmentPurpose {
  return value === "question" || value === "answer" || value === "ai";
}

type FileType = {
  extension: string;
  contentType: string;
  kind: AttachmentKind;
  /** TeliTol AI can read its text. */
  readable: boolean;
  label: string;
};

/** Every file type TeliTol accepts, keyed by extension. */
export const FILE_TYPES: Record<string, FileType> = {
  pdf: { extension: "pdf", contentType: "application/pdf", kind: "document", readable: true, label: "PDF" },
  docx: {
    extension: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    readable: true,
    label: "Word",
  },
  doc: { extension: "doc", contentType: "application/msword", kind: "document", readable: false, label: "Word" },
  xlsx: {
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "document",
    readable: true,
    label: "Excel",
  },
  xls: { extension: "xls", contentType: "application/vnd.ms-excel", kind: "document", readable: false, label: "Excel" },
  pptx: {
    extension: "pptx",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "document",
    readable: true,
    label: "PowerPoint",
  },
  ppt: { extension: "ppt", contentType: "application/vnd.ms-powerpoint", kind: "document", readable: false, label: "PowerPoint" },
  txt: { extension: "txt", contentType: "text/plain", kind: "document", readable: true, label: "Text" },
  csv: { extension: "csv", contentType: "text/csv", kind: "document", readable: true, label: "CSV" },
  mp3: { extension: "mp3", contentType: "audio/mpeg", kind: "audio", readable: false, label: "Audio" },
  m4a: { extension: "m4a", contentType: "audio/mp4", kind: "audio", readable: false, label: "Audio" },
  aac: { extension: "aac", contentType: "audio/aac", kind: "audio", readable: false, label: "Audio" },
  ogg: { extension: "ogg", contentType: "audio/ogg", kind: "audio", readable: false, label: "Audio" },
  opus: { extension: "opus", contentType: "audio/ogg", kind: "audio", readable: false, label: "Audio" },
  wav: { extension: "wav", contentType: "audio/wav", kind: "audio", readable: false, label: "Audio" },
  mp4: { extension: "mp4", contentType: "video/mp4", kind: "video", readable: false, label: "Video" },
  mov: { extension: "mov", contentType: "video/quicktime", kind: "video", readable: false, label: "Video" },
  webm: { extension: "webm", contentType: "video/webm", kind: "video", readable: false, label: "Video" },
};

/** Size limits by kind. Large files go straight to storage, not through our server. */
export const MAX_BYTES: Record<AttachmentKind, number> = {
  document: 15 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

/** Largest document the AI will read. */
export const MAX_AI_BYTES = 10 * 1024 * 1024;

/** Most attachments per post. */
export const MAX_ATTACHMENTS: Record<AttachmentPurpose, number> = {
  question: 3,
  answer: 2,
  ai: 1,
};

/** Unused uploads (never attached, or whose post is gone) are removed after this. */
export const ATTACHMENT_ORPHAN_HOURS = 24;

/** The `accept` list for file inputs, per purpose. */
export function acceptList(purpose: AttachmentPurpose): string {
  const types = Object.values(FILE_TYPES).filter((t) =>
    purpose === "ai" ? t.readable : true,
  );
  return [
    ...new Set(types.flatMap((t) => [`.${t.extension}`, t.contentType])),
  ].join(",");
}

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** A display name safe to store and show: no paths, no control characters, ≤120 chars. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>"]/g, "").trim();
  if (!cleaned) return "file";
  if (cleaned.length <= 120) return cleaned;
  const ext = extensionOf(cleaned);
  return `${cleaned.slice(0, 110)}…${ext ? `.${ext}` : ""}`;
}

/**
 * The checks before an upload may start: a known file type for this purpose,
 * within the size limit. Returns the file type, or a reason to refuse.
 */
export function checkUploadRequest(
  purpose: AttachmentPurpose,
  name: string,
  size: number,
): { ok: true; type: FileType } | { ok: false; error: string } {
  const type = FILE_TYPES[extensionOf(name)];
  if (!type)
    return {
      ok: false,
      error:
        "That file type isn't supported. Use PDF, Word, Excel, PowerPoint, text, audio or video.",
    };
  if (purpose === "ai" && !type.readable)
    return {
      ok: false,
      error: "TeliTol AI can read PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) and text files.",
    };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file is empty." };
  const limit = purpose === "ai" ? MAX_AI_BYTES : MAX_BYTES[type.kind];
  if (size > limit)
    return {
      ok: false,
      error: `That file is too large. The limit is ${Math.round(limit / 1024 / 1024)} MB.`,
    };
  return { ok: true, type };
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.slice(from, to));

/** Names Office files start with; anything else in a ZIP (an .apk, say) is refused. */
const OOXML_FIRST_ENTRIES = ["[Content_Types].xml", "_rels/.rels", "docProps/"];

/**
 * Check a file's first bytes really match its extension, so a renamed
 * program or web page can't pass as a document. `head` should be at least
 * the first 512 bytes.
 */
export function contentMatches(extension: string, head: Uint8Array): boolean {
  const b = head;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  switch (extension) {
    case "pdf":
      return ascii(b, 0, 5) === "%PDF-";
    case "docx":
    case "xlsx":
    case "pptx": {
      if (!starts(0x50, 0x4b, 0x03, 0x04) || b.length < 30) return false;
      const nameLength = b[26] | (b[27] << 8);
      const first = ascii(b, 30, 30 + nameLength);
      return OOXML_FIRST_ENTRIES.some((n) => first.startsWith(n));
    }
    case "doc":
    case "xls":
    case "ppt":
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "txt":
    case "csv": {
      // Plain text: no NUL bytes, and not an HTML page in disguise.
      if (b.includes(0)) return false;
      const start = new TextDecoder("utf-8", { fatal: false })
        .decode(b.slice(0, 512))
        .trimStart()
        .toLowerCase();
      return !start.startsWith("<!doctype") && !start.startsWith("<html") && !start.startsWith("<script");
    }
    case "mp3":
      return ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "aac":
      return b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
    case "m4a":
    case "mp4":
    case "mov":
      return ascii(b, 4, 8) === "ftyp" || ascii(b, 4, 8) === "moov" || ascii(b, 4, 8) === "wide";
    case "ogg":
    case "opus":
      return ascii(b, 0, 4) === "OggS";
    case "wav":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE";
    case "webm":
      return starts(0x1a, 0x45, 0xdf, 0xa3);
    default:
      return false;
  }
}

/** Storage path for a new upload: random, so no member id appears in a public link. */
export function newPathname(purpose: AttachmentPurpose, uuid: string, extension: string): string {
  return `files/${purpose}/${uuid}.${extension}`;
}

/** A pathname we issued for this purpose, and nothing else. */
export function isOurPathname(purpose: AttachmentPurpose, pathname: string): boolean {
  return new RegExp(
    `^files/${purpose}/[0-9a-f-]{36}\\.(${Object.keys(FILE_TYPES).join("|")})$`,
  ).test(pathname);
}

export async function recordAttachment(
  sql: Sql,
  input: {
    userId: string;
    url: string;
    pathname: string;
    name: string;
    contentType: string;
    kind: AttachmentKind;
    bytes: number;
    purpose: AttachmentPurpose;
    extractedText: string | null;
  },
): Promise<Attachment & { id: number }> {
  const rows = await sql<{ id: number }>`
    insert into attachments (user_id, url, pathname, name, content_type, kind, bytes, purpose, extracted_text)
    values (${input.userId}, ${input.url}, ${input.pathname}, ${input.name}, ${input.contentType},
            ${input.kind}, ${input.bytes}, ${input.purpose}, ${input.extractedText})
    on conflict (url) do nothing
    returning id
  `;
  if (!rows[0]) throw new Error("That file is already attached.");
  return {
    id: Number(rows[0].id),
    url: input.url,
    name: input.name,
    contentType: input.contentType,
    kind: input.kind,
    bytes: input.bytes,
  };
}

/** Clean list of ids: integers, no repeats, in the order given. */
export function cleanAttachmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids;
}

/**
 * Check files can be attached: each was uploaded by this member for this
 * purpose and isn't already used elsewhere (`except` allows a post's own
 * files when editing it).
 */
export async function checkAttachments(
  sql: Sql,
  userId: string,
  purpose: AttachmentPurpose,
  ids: number[],
  except: { questionId?: number } = {},
): Promise<string | null> {
  if (ids.length === 0) return null;
  if (ids.length > MAX_ATTACHMENTS[purpose])
    return `You can attach up to ${MAX_ATTACHMENTS[purpose]} file${MAX_ATTACHMENTS[purpose] === 1 ? "" : "s"}.`;
  const rows = await sql.query<{ id: number; in_use: unknown }>(
    `select f.id,
       (exists (select 1 from question_attachments qa where qa.attachment_id = f.id and qa.question_id <> $4)
        or exists (select 1 from answer_attachments aa where aa.attachment_id = f.id)
        or exists (select 1 from laya_messages m where m.attachment_id = f.id)) as in_use
     from attachments f
     where f.id = any($1::int[]) and f.user_id = $2 and f.purpose = $3`,
    [`{${ids.join(",")}}`, userId, purpose, except.questionId ?? 0],
  );
  if (rows.length !== ids.length) return "One of those files isn't available. Attach it again.";
  if (rows.some((row) => row.in_use === true || row.in_use === "t" || row.in_use === "true"))
    return "One of those files is already attached elsewhere. Attach it again.";
  return null;
}

export async function setQuestionAttachments(sql: Sql, questionId: number, ids: number[]) {
  await sql`delete from question_attachments where question_id = ${questionId}`;
  for (const [position, attachmentId] of ids.entries()) {
    await sql`
      insert into question_attachments (question_id, attachment_id, position)
      values (${questionId}, ${attachmentId}, ${position})
    `;
  }
}

export async function setAnswerAttachments(sql: Sql, answerId: number, ids: number[]) {
  await sql`delete from answer_attachments where answer_id = ${answerId}`;
  for (const [position, attachmentId] of ids.entries()) {
    await sql`
      insert into answer_attachments (answer_id, attachment_id, position)
      values (${answerId}, ${attachmentId}, ${position})
    `;
  }
}

const FILE_JSON = `json_build_object('id', f.id, 'url', f.url, 'name', f.name,
  'contentType', f.content_type, 'kind', f.kind, 'bytes', f.bytes)`;

/** JSON array of a question's files, for use inside a select (alias q). */
export const QUESTION_FILES_SQL = `coalesce((
    select json_agg(${FILE_JSON} order by qa.position)
    from question_attachments qa join attachments f on f.id = qa.attachment_id
    where qa.question_id = q.id
  ), '[]'::json)`;

/** JSON array of an answer's files, for use inside a select (alias a). */
export const ANSWER_FILES_SQL = `coalesce((
    select json_agg(${FILE_JSON} order by aa.position)
    from answer_attachments aa join attachments f on f.id = aa.attachment_id
    where aa.answer_id = a.id
  ), '[]'::json)`;

/** Attachments as returned by the database driver (parsed JSON or a JSON string). */
export function parseAttachments(value: unknown): Attachment[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: Attachment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.url !== "string" || typeof f.name !== "string") continue;
    const kind = f.kind === "audio" || f.kind === "video" ? f.kind : "document";
    const id = Number(f.id);
    out.push({
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      url: f.url,
      name: f.name,
      contentType: typeof f.contentType === "string" ? f.contentType : "",
      kind,
      bytes: Math.max(0, Number(f.bytes) || 0),
    });
  }
  return out;
}

/** Remove attachment rows nobody uses and return their URLs for file deletion. */
export async function sweepOrphanAttachments(sql: Sql, limit = 50): Promise<string[]> {
  const rows = await sql<{ url: string }>`
    delete from attachments
    where id in (
      select f.id from attachments f
      where f.created_at < now() - make_interval(hours => ${ATTACHMENT_ORPHAN_HOURS}::int)
        and not exists (select 1 from question_attachments qa where qa.attachment_id = f.id)
        and not exists (select 1 from answer_attachments aa where aa.attachment_id = f.id)
        and not exists (select 1 from laya_messages m where m.attachment_id = f.id)
      order by f.created_at
      limit ${limit}
    )
    returning url
  `;
  return rows.map((row) => row.url);
}

/** URLs of every file a member uploaded (for account deletion). */
export async function attachmentUrlsOf(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ url: string }>`select url from attachments where user_id = ${userId}`;
  return rows.map((row) => row.url);
}

/** Human-readable size, e.g. "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
