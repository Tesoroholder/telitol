import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Sql } from "../db.ts";
import { fetchQuestionPage, PAGE_SIZE } from "./questions.ts";
import { allowAction, LIMITS } from "./rate-limit.ts";
import { createTestSql } from "./test-db.ts";

let sql: Sql;
let close: () => Promise<void>;

before(async () => {
  ({ sql, close } = await createTestSql());
  // 45 questions, one second apart, on top of the 6 seed questions.
  for (let i = 0; i < 45; i += 1) {
    await sql`
      insert into questions (user_id, author_name, title, body, category, kind, created_at)
      values ('u1', 'Tester', ${`Question number ${i}`}, 'A body that is long enough to pass.',
              ${i % 2 ? "career" : "life"}, 'knowledge', now() - make_interval(secs => ${i}::int))
    `;
  }
});

after(async () => {
  await close();
});

test("pages walk the whole feed once, newest first, with no repeats", async () => {
  const seen: number[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await fetchQuestionPage(sql, {
      viewerId: "u1",
      cursor,
      category: null,
      search: "",
    });
    assert.ok(page.items.length <= PAGE_SIZE);
    seen.push(...page.items.map((q) => q.id));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(seen.length, 51);
  assert.equal(new Set(seen).size, 51);
  assert.equal(pages, 3);
});

test("category and search filter on the server", async () => {
  const career = await fetchQuestionPage(sql, {
    viewerId: "u1",
    cursor: null,
    category: "career",
    search: "",
  });
  assert.ok(career.items.length > 0);
  assert.ok(career.items.every((q) => q.category === "career"));

  const found = await fetchQuestionPage(sql, {
    viewerId: "u1",
    cursor: null,
    category: null,
    search: "number 7",
  });
  assert.deepEqual(
    found.items.map((q) => q.title),
    ["Question number 7"],
  );
});

test("search treats % and _ literally", async () => {
  const page = await fetchQuestionPage(sql, {
    viewerId: "u1",
    cursor: null,
    category: null,
    search: "%",
  });
  assert.equal(page.items.length, 0);
});

test("hidden questions drop out of the feed", async () => {
  const [row] = await sql<{
    id: number;
  }>`select id from questions where title = 'Question number 0'`;
  await sql`update questions set hidden_at = now() where id = ${row.id}`;
  const page = await fetchQuestionPage(sql, {
    viewerId: "u1",
    cursor: null,
    category: null,
    search: "Question number 0",
  });
  assert.equal(page.items.length, 0);
});

test("a malformed cursor is ignored instead of erroring", async () => {
  const page = await fetchQuestionPage(sql, {
    viewerId: "u1",
    cursor: "1; drop table x",
    category: null,
    search: "",
  });
  assert.equal(page.items.length, PAGE_SIZE);
});

test("rate limit allows exactly max hits per window, per user", async () => {
  const { max } = LIMITS.question;
  for (let i = 0; i < max; i += 1)
    assert.equal(await allowAction(sql, "question", "u2"), true);
  assert.equal(await allowAction(sql, "question", "u2"), false);
  assert.equal(await allowAction(sql, "question", "u3"), true);
});

test("rate limit window resets once it has passed", async () => {
  await sql`update app_rate_limits set window_start = now() - interval '2 hours' where key = 'question:u2'`;
  assert.equal(await allowAction(sql, "question", "u2"), true);
});
