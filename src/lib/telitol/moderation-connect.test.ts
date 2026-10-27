import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import {
  blockPartner,
  getState,
  joinQueue,
  leave,
  listMessages,
  sendMessage,
} from "./connect.ts";
import {
  AUTO_HIDE_THRESHOLD,
  fileReport,
  getRole,
  listOpenReports,
  resolveReports,
  suspensionMessage,
} from "./moderation.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
let close: () => Promise<void>;
let questionId: number;
let answerId: number;

before(async () => {
  ({ sql, withTx, close } = await createTestSql());
  for (const id of ["author", "r1", "r2", "r3", "mod", "a", "b", "c", "d"]) {
    await sql`insert into profiles (user_id, display_name) values (${id}, ${id})`;
  }
  const q = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('author', 'author', 'A question to report', 'Some body text for the question.', 'life', 'experience')
    returning id`;
  questionId = q[0].id;
  const a = await sql<{ id: number }>`
    insert into answers (question_id, user_id, author_name, body)
    values (${questionId}, 'author', 'author', 'An answer that someone will report.')
    returning id`;
  answerId = a[0].id;
});

after(async () => {
  await close();
});

test("you can't report your own post", async () => {
  const result = await fileReport(sql, {
    reporterId: "author",
    targetType: "question",
    targetId: String(questionId),
    reason: "spam",
    details: "",
  });
  assert.equal(result.ok, false);
});

test(`a question is hidden after ${AUTO_HIDE_THRESHOLD} distinct reporters, not before`, async () => {
  const report = (reporterId: string) =>
    fileReport(sql, {
      reporterId,
      targetType: "question",
      targetId: String(questionId),
      reason: "spam",
      details: "",
    });
  assert.deepEqual(await report("r1"), { ok: true, hidden: false });
  assert.deepEqual(await report("r1"), { ok: true, hidden: false }); // duplicate doesn't count
  assert.deepEqual(await report("r2"), { ok: true, hidden: false });
  assert.deepEqual(await report("r3"), { ok: true, hidden: true });
  const [row] = await sql<{
    hidden: boolean;
  }>`select hidden_at is not null as hidden from questions where id = ${questionId}`;
  assert.equal(row.hidden, true);
});

test("moderators see grouped reports and can restore + dismiss", async () => {
  const groups = await listOpenReports(sql);
  const group = groups.find((g) => g.targetType === "question");
  assert.ok(group);
  assert.equal(group.reportCount, 3);
  assert.equal(group.hidden, true);
  assert.match(group.preview, /A question to report/);

  await withTx((tx) =>
    resolveReports(tx, {
      moderatorId: "mod",
      targetType: "question",
      targetId: String(questionId),
      action: "restore",
      suspendDays: 0,
      note: "",
    }),
  );
  const [row] = await sql<{
    hidden: boolean;
  }>`select hidden_at is not null as hidden from questions where id = ${questionId}`;
  assert.equal(row.hidden, false);
  assert.equal((await listOpenReports(sql)).length, 0);
});

test("upholding a report with a suspension blocks the author from posting", async () => {
  await fileReport(sql, {
    reporterId: "r1",
    targetType: "answer",
    targetId: String(answerId),
    reason: "harassment",
    details: "rude",
  });
  await withTx((tx) =>
    resolveReports(tx, {
      moderatorId: "mod",
      targetType: "answer",
      targetId: String(answerId),
      action: "hide",
      suspendDays: 7,
      note: "harassment",
    }),
  );
  assert.match(
    (await suspensionMessage(sql, "author")) ?? "",
    /can't post until/,
  );
  assert.equal(await suspensionMessage(sql, "r1"), null);
  const [log] = await sql<{
    action: string;
  }>`select action from moderation_actions order by id desc limit 1`;
  assert.equal(log.action, "hide+suspend:7d");
});

test("ADMIN_EMAILS grants admin; profiles.role grants moderator", async () => {
  await sql`insert into "user" (id, name, email, "emailVerified") values ('boss', 'Boss', 'Boss@Example.com', true)`;
  process.env.ADMIN_EMAILS = "someone@else.com, boss@example.com";
  assert.equal(await getRole(sql, "boss"), "admin");
  delete process.env.ADMIN_EMAILS;
  assert.equal(await getRole(sql, "boss"), "member");
  await sql`update profiles set role = 'moderator' where user_id = 'mod'`;
  assert.equal(await getRole(sql, "mod"), "moderator");
  assert.equal(await getRole(sql, "nobody"), "member");
});

test("two people joining are matched into one room with different aliases", async () => {
  assert.deepEqual(await withTx((tx) => joinQueue(tx, "a", null)), {
    status: "waiting",
  });
  assert.equal((await getState(sql, "a")).status, "waiting");
  const matched = await withTx((tx) => joinQueue(tx, "b", null));
  assert.equal(matched.status, "matched");
  if (matched.status !== "matched") return;
  assert.equal(matched.partnerId, "a");
  assert.notEqual(matched.room.myAlias, matched.room.partnerAlias);

  const stateA = await getState(sql, "a");
  assert.equal(stateA.status, "in_room");
  if (stateA.status === "in_room")
    assert.equal(stateA.room.id, matched.room.id);
});

test("only room members can send and read; messages arrive in order", async () => {
  const state = await getState(sql, "a");
  assert.equal(state.status, "in_room");
  if (state.status !== "in_room") return;
  const roomId = state.room.id;

  assert.equal((await sendMessage(sql, "c", roomId, "intruder")).ok, false);
  assert.equal(await listMessages(sql, "c", roomId, 0), null);
  assert.equal((await sendMessage(sql, "a", roomId, "   ")).ok, false);

  const first = await sendMessage(sql, "a", roomId, "hi there");
  assert.ok(first.ok);
  await sendMessage(sql, "b", roomId, "hello!");
  const seen = await listMessages(sql, "b", roomId, 0);
  assert.deepEqual(
    seen?.messages.map((m) => [m.body, m.mine]),
    [
      ["hi there", false],
      ["hello!", true],
    ],
  );
  const later = await listMessages(
    sql,
    "b",
    roomId,
    first.ok ? first.message.id : 0,
  );
  assert.deepEqual(
    later?.messages.map((m) => m.body),
    ["hello!"],
  );
});

test("a Connect room can be reported only by its members, against the other person", async () => {
  const state = await getState(sql, "a");
  if (state.status !== "in_room") throw new Error("expected room");
  const roomId = state.room.id;
  assert.equal(
    (
      await fileReport(sql, {
        reporterId: "c",
        targetType: "connect_room",
        targetId: roomId,
        reason: "other",
        details: "",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await fileReport(sql, {
        reporterId: "a",
        targetType: "connect_room",
        targetId: roomId,
        reason: "harassment",
        details: "",
      })
    ).ok,
    true,
  );
  const group = (await listOpenReports(sql)).find(
    (g) => g.targetType === "connect_room",
  );
  assert.equal(group?.targetUserId, "b");
  assert.match(group?.preview ?? "", /hello!/);
});

test("blocking ends the room and stops the pair being matched again", async () => {
  const state = await getState(sql, "a");
  if (state.status !== "in_room") throw new Error("expected room");
  assert.deepEqual(await blockPartner(sql, "a", state.room.id), {
    partnerId: "b",
  });
  assert.equal(
    (await sendMessage(sql, "b", state.room.id, "still there?")).ok,
    false,
  );
  assert.equal((await getState(sql, "a")).status, "idle");

  assert.equal(
    (await withTx((tx) => joinQueue(tx, "b", null))).status,
    "waiting",
  );
  assert.equal(
    (await withTx((tx) => joinQueue(tx, "a", null))).status,
    "waiting",
  );
  const third = await withTx((tx) => joinQueue(tx, "c", null));
  assert.equal(third.status, "matched");
  if (third.status === "matched") assert.equal(third.partnerId, "b");
});

test("topics match each other or anyone with no topic; leave ends the room", async () => {
  await leave(sql, "a");
  await leave(sql, "b");
  await leave(sql, "c");
  assert.equal(
    (await withTx((tx) => joinQueue(tx, "a", "career"))).status,
    "waiting",
  );
  assert.equal(
    (await withTx((tx) => joinQueue(tx, "d", "health"))).status,
    "waiting",
  );
  const matched = await withTx((tx) => joinQueue(tx, "c", "career"));
  assert.equal(matched.status, "matched");
  if (matched.status !== "matched") return;
  assert.equal(matched.partnerId, "a");
  assert.deepEqual(await leave(sql, "c"), {
    roomId: matched.room.id,
    partnerId: "a",
  });
  assert.equal((await getState(sql, "a")).status, "idle");
});

test("suspended members are not matched", async () => {
  await leave(sql, "d");
  await sql`update profiles set suspended_until = now() + interval '1 day' where user_id = 'r2'`;
  assert.equal(
    (await withTx((tx) => joinQueue(tx, "r2", null))).status,
    "waiting",
  );
  assert.equal(
    (await withTx((tx) => joinQueue(tx, "r3", null))).status,
    "waiting",
  );
});
