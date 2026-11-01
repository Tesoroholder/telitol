import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import { fileReport, resolveReports } from "./moderation.ts";
import {
  listNotifications,
  markRead,
  notify,
  unreadCount,
} from "./notifications.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
let close: () => Promise<void>;
let questionId: number;
let answerId: number;

before(async () => {
  ({ sql, withTx, close } = await createTestSql());
  const [q] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('asker', 'Asker', 'How did your first week alone go?', 'Moving soon and want honest stories.', 'life', 'experience')
    returning id`;
  questionId = q.id;
  const [a] = await sql<{ id: number }>`
    insert into answers (question_id, user_id, author_name, body)
    values (${questionId}, 'helper', 'Helper', 'I cooked one real meal every night.')
    returning id`;
  answerId = a.id;
});

after(async () => {
  await close();
});

test("a new answer notifies the asker with the question title", async () => {
  await notify(sql, {
    userId: "asker",
    kind: "answer",
    questionId,
    answerId,
    actorName: "Helper",
  });
  const [item] = await listNotifications(sql, "asker");
  assert.equal(item.kind, "answer");
  assert.equal(item.actorName, "Helper");
  assert.equal(item.questionTitle, "How did your first week alone go?");
  assert.equal(item.read, false);
  assert.equal(await unreadCount(sql, "asker"), 1);
});

test("helpful votes on one answer stack into one unread notification", async () => {
  for (let i = 0; i < 3; i += 1) {
    await notify(sql, {
      userId: "helper",
      kind: "helpful",
      questionId,
      answerId,
    });
  }
  const items = await listNotifications(sql, "helper");
  assert.equal(items.length, 1);
  assert.equal(items[0].count, 3);

  // Once read, the next vote starts a fresh notification.
  await markRead(sql, "helper", items[0].id);
  await notify(sql, {
    userId: "helper",
    kind: "helpful",
    questionId,
    answerId,
  });
  const after = await listNotifications(sql, "helper");
  assert.equal(after.length, 2);
  assert.equal(await unreadCount(sql, "helper"), 1);
});

test("seed users never get notifications", async () => {
  await notify(sql, {
    userId: "seed:nila",
    kind: "answer",
    questionId,
    answerId,
  });
  assert.equal(await unreadCount(sql, "seed:nila"), 0);
});

test("mark all read only touches your own notifications", async () => {
  await markRead(sql, "asker", null);
  assert.equal(await unreadCount(sql, "asker"), 0);
  assert.equal(await unreadCount(sql, "helper"), 1);
});

test("a moderator hiding an answer and suspending its author notifies them", async () => {
  for (const reporter of ["r1", "r2"]) {
    await fileReport(sql, {
      reporterId: reporter,
      targetType: "answer",
      targetId: String(answerId),
      reason: "spam",
      details: "",
    });
  }
  await markRead(sql, "helper", null);
  await withTx((tx) =>
    resolveReports(tx, {
      moderatorId: "mod",
      targetType: "answer",
      targetId: String(answerId),
      action: "hide",
      suspendDays: 3,
      note: "",
    }),
  );
  const kinds = (await listNotifications(sql, "helper"))
    .filter((n) => !n.read)
    .map((n) => n.kind)
    .sort();
  assert.deepEqual(kinds, ["hidden", "suspended"]);
  const hidden = (await listNotifications(sql, "helper")).find(
    (n) => n.kind === "hidden",
  );
  assert.equal(hidden?.questionId, questionId);
});

test("deleting a question removes its notifications", async () => {
  await sql`delete from questions where id = ${questionId}`;
  const left = await listNotifications(sql, "asker");
  assert.equal(left.filter((n) => n.questionId === questionId).length, 0);
});
