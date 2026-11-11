import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import {
  fetchQuestionPage,
  updateOwnQuestion,
  validateQuestion,
} from "./questions.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let close: () => Promise<void>;
let questionId: number;

const edit = {
  title: "An edited title that is long enough",
  body: "The edited question text, with more detail than before.",
  category: "career",
  kind: "knowledge",
};

before(async () => {
  ({ sql, close } = await createTestSql());
  const [row] = await sql<{ id: number }>`
    insert into questions (user_id, author_name, title, body, category, kind)
    values ('asker', 'Asker', 'The original title here', 'The original question text, long enough.', 'life', 'experience')
    returning id`;
  questionId = Number(row.id);
  await sql`insert into answers (question_id, user_id, author_name, body) values (${questionId}, 'other', 'Other', 'An answer that should survive the edit.')`;
});

after(async () => {
  await close();
});

test("the same rules apply to new and edited questions", () => {
  assert.equal(validateQuestion(edit), null);
  assert.match(validateQuestion({ ...edit, title: "short" }) ?? "", /title/);
  assert.match(validateQuestion({ ...edit, body: "too short" }) ?? "", /detail/);
  assert.match(validateQuestion({ ...edit, category: "nope" }) ?? "", /category/);
  assert.match(validateQuestion({ ...edit, kind: "nope" }) ?? "", /experience or knowledge/);
});

test("only the asker can edit, and others' attempts change nothing", async () => {
  const result = await updateOwnQuestion(sql, "other", questionId, edit);
  assert.deepEqual(result, { ok: false, error: "You can only edit your own question." });
  const [row] = await sql<{ title: string; edited_at: string | null }>`
    select title, edited_at from questions where id = ${questionId}`;
  assert.equal(row.title, "The original title here");
  assert.equal(row.edited_at, null);
  assert.equal((await updateOwnQuestion(sql, "asker", 999999, edit)).ok, false);
  assert.equal((await updateOwnQuestion(sql, "asker", -1, edit)).ok, false);
});

test("the asker can edit any time; answers stay and readers see it was edited", async () => {
  // Pretend it was posted a year ago.
  await sql`update questions set created_at = now() - interval '365 days' where id = ${questionId}`;
  assert.deepEqual(await updateOwnQuestion(sql, "asker", questionId, edit), { ok: true });

  const [row] = await sql<{ title: string; body: string; category: string; kind: string; edited: boolean; answers: number }>`
    select title, body, category, kind, edited_at is not null as edited,
      (select count(*)::int from answers where question_id = ${questionId}) as answers
    from questions where id = ${questionId}`;
  assert.equal(row.title, edit.title);
  assert.equal(row.body, edit.body);
  assert.equal(row.category, "career");
  assert.equal(row.kind, "knowledge");
  assert.equal(row.edited, true);
  assert.equal(row.answers, 1);

  // The feed card carries the edit time, and search finds the new words.
  const page = await fetchQuestionPage(sql, {
    viewerId: "asker",
    cursor: null,
    category: null,
    search: "edited title",
  });
  const card = page.items.find((q) => q.id === questionId);
  assert.ok(card);
  assert.equal(card.isMine, true);
  assert.equal(card.hidden, false);
  assert.match(card.editedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("a question hidden for review can't be edited", async () => {
  await sql`update questions set hidden_at = now() where id = ${questionId}`;
  const result = await updateOwnQuestion(sql, "asker", questionId, {
    ...edit,
    title: "Trying to edit while hidden",
  });
  assert.equal(result.ok, false);
  const [row] = await sql<{ title: string }>`select title from questions where id = ${questionId}`;
  assert.equal(row.title, edit.title);
});
