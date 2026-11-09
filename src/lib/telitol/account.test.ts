import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import { deleteUserData } from "./account.ts";
import { fileReport, listOpenReports, resolveReports } from "./moderation.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
let close: () => Promise<void>;

const count = async (table: string, where: string, id: string) =>
  Number(
    (
      await sql.query<{ n: number }>(
        `select count(*)::int as n from ${table} where ${where}`,
        [id],
      )
    )[0]?.n ?? 0,
  );

before(async () => {
  ({ sql, withTx, close } = await createTestSql());
});

after(async () => {
  await close();
});

test("deleting an account removes the member's data and keeps everyone else's", async () => {
  for (const id of ["gone", "stay"]) {
    await sql`insert into "user" (id, name, email, "emailVerified") values (${id}, ${id}, ${`${id}@example.com`}, true)`;
    await sql`insert into profiles (user_id, display_name) values (${id}, ${id})`;
  }
  // gone's question, with an answer from stay under it.
  const [q1] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('gone', 'gone', 'A question to delete', 'Body text long enough to post.', 'life', 'experience')
    returning id`;
  await sql`insert into answers (question_id, user_id, author_name, body) values (${q1.id}, 'stay', 'stay', 'An answer under the deleted question.')`;
  // stay's question, with an answer from gone, and gone's helpful vote on stay's answer.
  const [q2] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('stay', 'stay', 'A question that stays', 'Body text long enough to post.', 'life', 'experience')
    returning id`;
  await sql`insert into answers (question_id, user_id, author_name, body) values (${q2.id}, 'gone', 'gone', 'An answer that should go.')`;
  const [stayAnswer] = await sql<{ id: number }>`
    insert into answers (question_id, user_id, author_name, body, helpful)
    values (${q2.id}, 'stay', 'stay', 'An answer that stays.', 1) returning id`;
  await sql`insert into helpful_votes (user_id, answer_id) values ('gone', ${stayAnswer.id})`;
  // AI chat, Connect, notifications, reports, rate limits, reset token.
  const [thread] = await sql<{ id: number }>`insert into laya_threads (user_id, title) values ('gone', 'Chat') returning id`;
  await sql`insert into laya_messages (thread_id, user_id, role, content) values (${thread.id}, 'gone', 'user', 'hi')`;
  await sql`insert into connect_queue (user_id) values ('gone')`;
  await sql`insert into connect_rooms (id, user_a, user_b, alias_a, alias_b, expires_at) values ('room1', 'gone', 'stay', 'A', 'B', now())`;
  await sql`insert into connect_messages (room_id, sender_id, body) values ('room1', 'stay', 'hello')`;
  await sql`insert into connect_blocks (user_id, blocked_id) values ('stay', 'gone')`;
  await sql`insert into notifications (user_id, kind) values ('gone', 'suspended')`;
  await sql`insert into notifications (user_id, kind, question_id) values ('stay', 'answer', ${q2.id})`;
  await sql`insert into app_rate_limits (key, count) values ('question:gone', 1), ('question:stay', 1), ('question:xgone', 1)`;
  await sql`insert into verification (id, identifier, value, "expiresAt") values ('v1', 'reset-password:abc', 'gone', now() + interval '1 hour')`;

  await withTx((tx) => deleteUserData(tx, "gone"));

  for (const [table, where] of [
    ["profiles", "user_id = $1"],
    ["questions", "user_id = $1"],
    ["answers", "user_id = $1"],
    ["helpful_votes", "user_id = $1"],
    ["laya_threads", "user_id = $1"],
    ["laya_messages", "user_id = $1"],
    ["connect_queue", "user_id = $1"],
    ["connect_rooms", "user_a = $1 or user_b = $1"],
    ["connect_blocks", "user_id = $1 or blocked_id = $1"],
    ["notifications", "user_id = $1"],
    ["app_rate_limits", "key = 'question:' || $1"],
    ["verification", "value = $1"],
  ] as const) {
    assert.equal(await count(table, where, "gone"), 0, `${table} still has data`);
  }
  // The answer under gone's question went with it; the room's messages too.
  assert.equal(await count("answers", "question_id = $1::int", String(q1.id)), 0);
  assert.equal(await count("connect_messages", "room_id = $1", "room1"), 0);

  // Everyone else is untouched, and gone's helpful vote no longer counts.
  assert.equal(await count("profiles", "user_id = $1", "stay"), 1);
  assert.equal(await count("questions", "user_id = $1", "stay"), 1);
  assert.equal(await count("app_rate_limits", "key = $1", "question:stay"), 1);
  assert.equal(await count("app_rate_limits", "key = $1", "question:xgone"), 1);
  assert.equal(await count("notifications", "user_id = $1", "stay"), 1);
  const [kept] = await sql<{ helpful: number }>`select helpful from answers where id = ${stayAnswer.id}`;
  assert.equal(kept.helpful, 0);
});

test("seed and AI ids can't be deleted", async () => {
  await assert.rejects(withTx((tx) => deleteUserData(tx, "seed:nila")));
  await assert.rejects(withTx((tx) => deleteUserData(tx, "ai")));
  await assert.rejects(withTx((tx) => deleteUserData(tx, "")));
});

test("members can report AI replies in their own chats only, and moderators can resolve them", async () => {
  await sql`insert into profiles (user_id, display_name) values ('asker', 'asker'), ('other', 'other'), ('mod', 'mod')`;
  const [thread] = await sql<{ id: number }>`insert into laya_threads (user_id, title) values ('asker', 'Chat') returning id`;
  const [question] = await sql<{ id: number }>`
    insert into laya_messages (thread_id, user_id, role, content) values (${thread.id}, 'asker', 'user', 'a question') returning id`;
  const [reply] = await sql<{ id: number }>`
    insert into laya_messages (thread_id, user_id, role, content) values (${thread.id}, 'asker', 'assistant', 'A bad AI reply') returning id`;
  const report = (reporterId: string, id: number) =>
    fileReport(sql, {
      reporterId,
      targetType: "ai_message",
      targetId: String(id),
      reason: "misinformation",
      details: "wrong",
    });

  assert.equal((await report("other", reply.id)).ok, false); // not their chat
  assert.equal((await report("asker", question.id)).ok, false); // not an AI reply
  assert.deepEqual(await report("asker", reply.id), { ok: true, hidden: false });

  const group = (await listOpenReports(sql)).find(
    (g) => g.targetType === "ai_message",
  );
  assert.ok(group);
  assert.equal(group.authorName, "TeliTol AI");
  assert.equal(group.preview, "A bad AI reply");
  assert.equal(group.questionId, null);

  await withTx((tx) =>
    resolveReports(tx, {
      moderatorId: "mod",
      targetType: "ai_message",
      targetId: String(reply.id),
      action: "hide",
      suspendDays: 7, // ignored: there's no member to suspend
      note: "",
    }),
  );
  assert.equal(
    (await listOpenReports(sql)).filter((g) => g.targetType === "ai_message").length,
    0,
  );
  assert.equal(await count("profiles", "user_id = $1", "ai"), 0);
  assert.equal(await count("notifications", "user_id = $1", "ai"), 0);
});
