import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import {
  acceptList,
  attachmentUrlsOf,
  checkAttachments,
  checkUploadRequest,
  cleanAttachmentIds,
  cleanFileName,
  contentMatches,
  formatBytes,
  isOurPathname,
  newPathname,
  parseAttachments,
  recordAttachment,
  setAnswerAttachments,
  setQuestionAttachments,
  sweepOrphanAttachments,
} from "./attachments.ts";
import { fetchQuestionPage, updateOwnQuestion } from "./questions.ts";
import { deleteUserData } from "./account.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
let close: () => Promise<void>;
let n = 0;

const file = (
  userId: string,
  purpose: "question" | "answer" | "ai",
  name = "notes.pdf",
  kind: "document" | "audio" | "video" = "document",
) => {
  n += 1;
  const pathname = `files/${purpose}/${userId}-${n}.${name.split(".").pop()}`;
  return recordAttachment(sql, {
    userId,
    url: `https://example.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    name,
    contentType: "application/pdf",
    kind,
    bytes: 2048,
    purpose,
    extractedText: purpose === "ai" ? "Chapter one. The rain came early that year." : null,
  });
};

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

before(async () => {
  ({ sql, withTx, close } = await createTestSql());
  for (const id of ["ama", "kofi"]) {
    await sql`insert into "user" (id, name, email, "emailVerified") values (${id}, ${id}, ${`${id}@example.com`}, true)`;
    await sql`insert into profiles (user_id, display_name) values (${id}, ${id})`;
  }
});

after(async () => {
  await close();
});

test("upload requests are checked by type, size and place", () => {
  assert.equal(checkUploadRequest("question", "CV.PDF", 1000).ok, true);
  assert.equal(checkUploadRequest("answer", "voice.m4a", 5_000_000).ok, true);
  assert.equal(checkUploadRequest("question", "clip.mp4", 40 * 1024 * 1024).ok, true);
  assert.match(errorOf(checkUploadRequest("question", "clip.mp4", 60 * 1024 * 1024)), /50 MB/);
  assert.match(errorOf(checkUploadRequest("question", "setup.exe", 1000)), /isn't supported/);
  assert.match(errorOf(checkUploadRequest("question", "page.html", 1000)), /isn't supported/);
  assert.match(errorOf(checkUploadRequest("question", "empty.txt", 0)), /empty/);
  // AI only takes documents it can read.
  assert.equal(checkUploadRequest("ai", "essay.docx", 1000).ok, true);
  assert.match(errorOf(checkUploadRequest("ai", "song.mp3", 1000)), /can read/);
  assert.match(errorOf(checkUploadRequest("ai", "old.doc", 1000)), /can read/);
  assert.match(errorOf(checkUploadRequest("ai", "big.pdf", 11 * 1024 * 1024)), /10 MB/);

  assert.ok(acceptList("question").includes(".mp4"));
  assert.ok(!acceptList("ai").includes(".mp4"));
  assert.ok(acceptList("ai").includes("application/pdf"));
});

function errorOf(result: { ok: boolean; error?: string }): string {
  return result.ok ? "" : (result.error ?? "");
}

test("files must really be what their name says", () => {
  assert.equal(contentMatches("pdf", text("%PDF-1.7\n")), true);
  assert.equal(contentMatches("pdf", text("<html>%PDF-")), false);

  const zipWith = (name: string) => {
    const head = new Uint8Array(30 + name.length);
    head.set([0x50, 0x4b, 0x03, 0x04]);
    head[26] = name.length;
    head.set(text(name), 30);
    return head;
  };
  assert.equal(contentMatches("docx", zipWith("[Content_Types].xml")), true);
  assert.equal(contentMatches("xlsx", zipWith("_rels/.rels")), true);
  // A renamed app or plain ZIP is refused.
  assert.equal(contentMatches("docx", zipWith("AndroidManifest.xml")), false);
  assert.equal(contentMatches("docx", text("MZ\u0090\u0000")), false);

  assert.equal(contentMatches("doc", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)), true);
  assert.equal(contentMatches("txt", text("Hello there\nsecond line")), true);
  assert.equal(contentMatches("txt", text("  <!DOCTYPE html><script>")), false);
  assert.equal(contentMatches("csv", bytes(0x61, 0x00, 0x62)), false);

  assert.equal(contentMatches("mp3", text("ID3\u0004")), true);
  assert.equal(contentMatches("mp3", bytes(0xff, 0xfb, 0x90)), true);
  assert.equal(contentMatches("m4a", text("\u0000\u0000\u0000 ftypM4A ")), true);
  assert.equal(contentMatches("mp4", text("\u0000\u0000\u0000\u0018ftypmp42")), true);
  assert.equal(contentMatches("ogg", text("OggS")), true);
  assert.equal(contentMatches("wav", text("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")), true);
  assert.equal(contentMatches("webm", bytes(0x1a, 0x45, 0xdf, 0xa3)), true);
  assert.equal(contentMatches("mp4", text("<svg onload=alert(1)>")), false);
  assert.equal(contentMatches("exe", text("MZ")), false);
});

test("names, paths and sizes are tidy", () => {
  assert.equal(cleanFileName("  ../../My CV<final>.pdf "), cleanFileName(cleanFileName("  ../../My CV<final>.pdf ")));
  assert.ok(!cleanFileName("../../etc/passwd.txt").includes("/"));
  assert.ok(cleanFileName("a".repeat(500) + ".pdf").length <= 120);
  assert.ok(cleanFileName("report.pdf").endsWith(".pdf"));

  const path = newPathname("question", "1234abcd-1234-1234-1234-1234567890ab", "pdf");
  assert.equal(isOurPathname("question", path), true);
  assert.equal(isOurPathname("answer", path), false);
  assert.equal(isOurPathname("question", "files/question/../../avatar/x.pdf"), false);

  assert.deepEqual(cleanAttachmentIds([3, "4", 3, -1, 0, 2.5, "x", 7]), [3, 4, 7]);
  assert.equal(formatBytes(900), "900 B");
  assert.match(formatBytes(2.5 * 1024 * 1024), /2\.5 MB/);
});

test("questions carry their files in order, and edits can replace them", async () => {
  const a = await file("ama", "question", "plan.pdf");
  const b = await file("ama", "question", "voice.m4a", "audio");
  const [q] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('ama', 'ama', 'A question with files', 'Some detail that is long enough.', 'life', 'knowledge')
    returning id`;
  const qid = Number(q.id);
  assert.equal(await checkAttachments(sql, "ama", "question", [b.id, a.id]), null);
  await setQuestionAttachments(sql, qid, [b.id, a.id]);

  const page = await fetchQuestionPage(sql, { viewerId: "kofi", cursor: null, category: null, search: "" });
  const card = page.items.find((item) => item.id === qid);
  assert.ok(card);
  assert.deepEqual(card.files.map((f) => f.name), ["voice.m4a", "plan.pdf"]);
  assert.equal(card.files[0].kind, "audio");
  assert.equal(card.files[1].bytes, 2048);

  // Not someone else's file, not one already used, not the wrong kind.
  assert.match((await checkAttachments(sql, "kofi", "question", [a.id])) ?? "", /isn't available/);
  assert.match((await checkAttachments(sql, "ama", "question", [a.id])) ?? "", /already attached/);
  assert.equal(await checkAttachments(sql, "ama", "question", [a.id], { questionId: qid }), null);
  const forAi = await file("ama", "ai");
  assert.match((await checkAttachments(sql, "ama", "question", [forAi.id])) ?? "", /isn't available/);
  assert.match((await checkAttachments(sql, "ama", "question", [1, 2, 3, 4])) ?? "", /up to 3/);

  const edited = await updateOwnQuestion(
    sql,
    "ama",
    qid,
    { title: "A question with one file", body: "Some detail that is long enough.", category: "life", kind: "knowledge" },
    [],
    [a.id],
  );
  assert.deepEqual(edited, { ok: true });
  const after = await fetchQuestionPage(sql, { viewerId: "ama", cursor: null, category: null, search: "" });
  assert.deepEqual(after.items.find((item) => item.id === qid)?.files.map((f) => f.url), [a.url]);
});

test("answers keep their files", async () => {
  const [q] = await sql<{ id: number }>`select id from questions where user_id = 'ama' limit 1`;
  const [ans] = await sql<{ id: number }>`
    insert into answers (question_id, user_id, author_name, body)
    values (${q.id}, 'kofi', 'kofi', 'An answer with a video.') returning id`;
  const clip = await file("kofi", "answer", "how-to.mp4", "video");
  assert.equal(await checkAttachments(sql, "kofi", "answer", [clip.id]), null);
  await setAnswerAttachments(sql, Number(ans.id), [clip.id]);
  const rows = await sql<{ n: number }>`select count(*)::int as n from answer_attachments where answer_id = ${ans.id}`;
  assert.equal(rows[0].n, 1);
  assert.match((await checkAttachments(sql, "kofi", "answer", [1, 2, 3])) ?? "", /up to 2/);
});

test("a document sent to AI is used once and kept with the message", async () => {
  const doc = await file("ama", "ai", "chapter.pdf");
  assert.equal(await checkAttachments(sql, "ama", "ai", [doc.id]), null);
  const [thread] = await sql<{ id: number }>`
    insert into laya_threads (user_id, title) values ('ama', 'Summarise my chapter') returning id`;
  await sql`
    insert into laya_messages (thread_id, user_id, role, content, attachment_id)
    values (${thread.id}, 'ama', 'user', 'Summarise this', ${doc.id})`;
  assert.match((await checkAttachments(sql, "ama", "ai", [doc.id])) ?? "", /already attached/);
  assert.match((await checkAttachments(sql, "ama", "ai", [1, 2])) ?? "", /up to 1 file\./);
  const [row] = await sql<{ extracted_text: string }>`select extracted_text from attachments where id = ${doc.id}`;
  assert.match(row.extracted_text, /rain came early/);
});

test("the same stored file can't be recorded twice", async () => {
  const a = await file("ama", "question");
  await assert.rejects(
    recordAttachment(sql, {
      userId: "kofi",
      url: a.url,
      pathname: "files/question/again.pdf",
      name: "again.pdf",
      contentType: "application/pdf",
      kind: "document",
      bytes: 1,
      purpose: "question",
      extractedText: null,
    }),
    /already attached/,
  );
});

test("unused files are swept after a day; files in use never are", async () => {
  const unused = await file("ama", "question", "draft.pdf");
  await sql`update attachments set created_at = now() - interval '2 days'`;
  const swept = await sweepOrphanAttachments(sql, 100);
  assert.ok(swept.includes(unused.url));
  for (const url of swept) {
    const still = await sql<{ n: number }>`select count(*)::int as n from attachments where url = ${url}`;
    assert.equal(still[0].n, 0);
  }
  const inUse = await sql<{ n: number }>`
    select count(*)::int as n from attachments f
    where exists (select 1 from question_attachments qa where qa.attachment_id = f.id)
       or exists (select 1 from answer_attachments aa where aa.attachment_id = f.id)
       or exists (select 1 from laya_messages m where m.attachment_id = f.id)`;
  assert.equal(inUse[0].n, 3);
});

test("deleting an account removes every file record of that member", async () => {
  assert.ok((await attachmentUrlsOf(sql, "kofi")).length >= 1);
  await withTx((tx) => deleteUserData(tx, "kofi"));
  assert.deepEqual(await attachmentUrlsOf(sql, "kofi"), []);
  assert.ok((await attachmentUrlsOf(sql, "ama")).length >= 1);
});

test("database JSON comes back as files whether parsed or as text", () => {
  const json =
    '[{"id":5,"url":"https://x/a.pdf","name":"a.pdf","contentType":"application/pdf","kind":"document","bytes":"1200"}]';
  assert.deepEqual(parseAttachments(json), [
    { id: 5, url: "https://x/a.pdf", name: "a.pdf", contentType: "application/pdf", kind: "document", bytes: 1200 },
  ]);
  // Unknown kinds show as a plain document card, never as a player.
  assert.deepEqual(parseAttachments([{ url: "https://x/b", name: "b", kind: "virus", bytes: -1 }]), [
    { url: "https://x/b", name: "b", contentType: "", kind: "document", bytes: 0 },
  ]);
  assert.deepEqual(parseAttachments([{ name: "no url" }]), []);
  assert.deepEqual(parseAttachments("not json"), []);
  assert.deepEqual(parseAttachments(null), []);
});
