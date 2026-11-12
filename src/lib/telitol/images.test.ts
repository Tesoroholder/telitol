import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import {
  checkImages,
  cleanImageIds,
  imageUrlsOf,
  parseImages,
  recordImage,
  setAnswerImages,
  setQuestionImages,
  sniffImage,
  sweepOrphanImages,
} from "./images.ts";
import { fetchQuestionPage, updateOwnQuestion } from "./questions.ts";
import { joinQueue, listMessages, sendMessage } from "./connect.ts";
import { deleteUserData } from "./account.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
let close: () => Promise<void>;

const photo = (userId: string, purpose: "question" | "answer" | "avatar" | "connect", n: number) =>
  recordImage(sql, {
    userId,
    url: `https://example.public.blob.vercel-storage.com/${purpose}/${userId}-${n}.jpg`,
    pathname: `${purpose}/${userId}-${n}.jpg`,
    width: 800,
    height: 600,
    bytes: 1000,
    purpose,
  });

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

test("only real JPEG, PNG and WebP files are accepted", () => {
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.contentType, "image/jpeg");
  assert.equal(
    sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType,
    "image/png",
  );
  const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
  assert.equal(sniffImage(webp)?.contentType, "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a")), null);
  assert.equal(sniffImage(new Uint8Array([])), null);
});

test("photo id lists are cleaned", () => {
  assert.deepEqual(cleanImageIds([3, "4", 3, -1, 0, 2.5, "x", 7]), [3, 4, 7]);
  assert.deepEqual(cleanImageIds("1,2"), []);
});

test("questions carry their photos in order, and edits can replace them", async () => {
  const a = await photo("ama", "question", 1);
  const b = await photo("ama", "question", 2);
  const [q] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('ama', 'ama', 'A question with photos', 'Some detail that is long enough.', 'life', 'knowledge')
    returning id`;
  const qid = Number(q.id);
  assert.equal(await checkImages(sql, "ama", "question", [b.id, a.id]), null);
  await setQuestionImages(sql, qid, [b.id, a.id]);

  const page = await fetchQuestionPage(sql, { viewerId: "kofi", cursor: null, category: null, search: "" });
  const card = page.items.find((item) => item.id === qid);
  assert.ok(card);
  assert.deepEqual(card.images.map((i) => i.url), [b.url, a.url]);
  assert.equal(card.images[0].width, 800);
  assert.equal(card.authorAvatar, null);

  // Someone else can't attach Ama's photos, and photos can't be reused.
  assert.match((await checkImages(sql, "kofi", "question", [a.id])) ?? "", /isn't available/);
  const [other] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('ama', 'ama', 'Another question here', 'Some detail that is long enough.', 'life', 'knowledge')
    returning id`;
  assert.match((await checkImages(sql, "ama", "question", [a.id])) ?? "", /already used/);
  // ...but the question's own photos are fine when editing it.
  assert.equal(await checkImages(sql, "ama", "question", [a.id], { questionId: qid }), null);
  // Wrong kind of photo, and too many photos.
  const av = await photo("ama", "avatar", 1);
  assert.match((await checkImages(sql, "ama", "question", [av.id])) ?? "", /isn't available/);
  assert.match((await checkImages(sql, "ama", "question", [1, 2, 3, 4, 5])) ?? "", /up to 4/);

  const edited = await updateOwnQuestion(
    sql,
    "ama",
    qid,
    { title: "A question with one photo", body: "Some detail that is long enough.", category: "life", kind: "knowledge" },
    [a.id],
  );
  assert.deepEqual(edited, { ok: true });
  const after = await fetchQuestionPage(sql, { viewerId: "ama", cursor: null, category: null, search: "" });
  assert.deepEqual(after.items.find((item) => item.id === qid)?.images.map((i) => i.url), [a.url]);
  assert.ok(Number(other.id) > 0);
});

test("profile photos show on the author's questions", async () => {
  const av = await photo("kofi", "avatar", 1);
  assert.equal(await checkImages(sql, "kofi", "avatar", [av.id]), null);
  await sql`update profiles set avatar_image_id = ${av.id} where user_id = 'kofi'`;
  await sql`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('kofi', 'kofi', 'Kofi asks a question', 'Some detail that is long enough.', 'career', 'experience')`;
  const page = await fetchQuestionPage(sql, { viewerId: "ama", cursor: null, category: "career", search: "" });
  assert.equal(page.items[0]?.authorAvatar, av.url);
});

test("answers keep their photos", async () => {
  const [q] = await sql<{ id: number }>`select id from questions where user_id = 'kofi' limit 1`;
  const [ans] = await sql<{ id: number }>`
    insert into answers (question_id, user_id, author_name, body) values (${q.id}, 'ama', 'ama', 'An answer with a photo.') returning id`;
  const pic = await photo("ama", "answer", 1);
  assert.equal(await checkImages(sql, "ama", "answer", [pic.id]), null);
  await setAnswerImages(sql, Number(ans.id), [pic.id]);
  const rows = await sql<{ n: number }>`select count(*)::int as n from answer_images where answer_id = ${ans.id}`;
  assert.equal(rows[0].n, 1);
  assert.match((await checkImages(sql, "ama", "answer", [1, 2, 3])) ?? "", /up to 2/);
});

test("Connect messages can carry a photo, or be a photo alone", async () => {
  await withTx((tx) => joinQueue(tx, "ama", null));
  const matched = await withTx((tx) => joinQueue(tx, "kofi", null));
  assert.equal(matched.status, "matched");
  const roomId = matched.status === "matched" ? matched.room.id : "";
  const pic = await photo("kofi", "connect", 1);

  const sent = await sendMessage(sql, "kofi", roomId, "", pic.id);
  assert.equal(sent.ok, true);
  if (sent.ok) assert.equal(sent.message.image?.url, pic.url);

  // Same photo can't be sent twice; nobody else's photo can be sent.
  assert.equal((await sendMessage(sql, "kofi", roomId, "", pic.id)).ok, false);
  const amas = await photo("ama", "question", 9);
  assert.equal((await sendMessage(sql, "ama", roomId, "look", amas.id)).ok, false);
  assert.equal((await sendMessage(sql, "ama", roomId, "   ")).ok, false);

  const seen = await listMessages(sql, "ama", roomId, 0);
  assert.equal(seen?.messages[0]?.image?.url, pic.url);
  assert.equal(seen?.messages[0]?.mine, false);
  assert.equal(seen?.messages[0]?.body, "");
});

test("unused photos are swept after a day; photos in use never are", async () => {
  const unused = await photo("ama", "question", 50);
  await sql`update images set created_at = now() - interval '2 days'`;
  const swept = await sweepOrphanImages(sql, 100);
  assert.ok(swept.includes(unused.url));
  // Photos attached to posts, profiles and chats are all still there.
  const left = await sql<{ n: number }>`select count(*)::int as n from images where url = ${unused.url}`;
  assert.equal(left[0].n, 0);
  const inUse = await sql<{ n: number }>`
    select count(*)::int as n from images i
    where exists (select 1 from question_images qi where qi.image_id = i.id)
       or exists (select 1 from answer_images ai where ai.image_id = i.id)
       or exists (select 1 from profiles p where p.avatar_image_id = i.id)
       or exists (select 1 from connect_messages m where m.image_id = i.id)`;
  assert.ok(inUse[0].n >= 4);
  for (const url of swept) {
    const still = await sql<{ n: number }>`select count(*)::int as n from images where url = ${url}`;
    assert.equal(still[0].n, 0);
  }
});

test("deleting an account removes every photo record of that member", async () => {
  const urls = await imageUrlsOf(sql, "kofi");
  assert.ok(urls.length >= 1);
  await withTx((tx) => deleteUserData(tx, "kofi"));
  assert.deepEqual(await imageUrlsOf(sql, "kofi"), []);
  assert.ok((await imageUrlsOf(sql, "ama")).length >= 1);
});

test("database JSON comes back as photos whether parsed or as text", () => {
  const json = '[{"id":5,"url":"https://x/a.jpg","width":"640","height":480}]';
  assert.deepEqual(parseImages(json), [{ id: 5, url: "https://x/a.jpg", width: 640, height: 480 }]);
  assert.deepEqual(parseImages([{ url: "https://x/b.jpg", width: 0, height: 99999 }]), [
    { url: "https://x/b.jpg", width: 1, height: 4096 },
  ]);
  assert.deepEqual(parseImages("not json"), []);
  assert.deepEqual(parseImages(null), []);
});
