import type { Sql } from "../db.ts";
import {
  isCategory,
  type QuestionCard,
  type QuestionKind,
  type QuestionPage,
} from "./shared.ts";

/**
 * Question queries shared by the server functions. Kept free of server-function
 * and alias imports so tests can run them directly against PGLite.
 */

export function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export function asKind(value: string): QuestionKind {
  return value === "knowledge" ? "knowledge" : "experience";
}

export type QuestionRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  kind: string;
  author_name: string;
  reputation: number;
  answer_count: number;
  is_mine: unknown;
  is_hidden: unknown;
  created_at: string;
  edited_at: string | null;
};

export function mapQuestion(row: QuestionRow): QuestionCard {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    category: row.category,
    kind: asKind(row.kind),
    authorName: row.author_name,
    reputation: Number(row.reputation ?? 0),
    answerCount: Number(row.answer_count ?? 0),
    isMine: asBool(row.is_mine),
    hidden: asBool(row.is_hidden),
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

/** Select list for a question card; `$UID` is replaced with the viewer's param slot. */
export const QUESTION_SELECT = `
  q.id,
  q.title,
  q.body,
  q.category,
  q.kind,
  coalesce(p.display_name, q.author_name) as author_name,
  coalesce(p.reputation, 0) as reputation,
  (q.user_id = $UID) as is_mine,
  (q.hidden_at is not null) as is_hidden,
  (select count(*)::int from answers a where a.question_id = q.id and a.hidden_at is null) as answer_count,
  to_char(q.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
  to_char(q.edited_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as edited_at
`;

export const PAGE_SIZE = 20;
/** Deepest page reachable with an offset cursor (search and trending). */
const MAX_OFFSET = 1000;

export type FeedSort = "new" | "trending";

export type FeedQuery = {
  viewerId: string;
  /** `nextCursor` from the previous page. */
  cursor: string | null;
  category: string | null;
  search: string;
  sort?: FeedSort;
};

/**
 * Turn what someone typed into a prefix tsquery, so "mov alone" matches
 * "moving alone" and "Moved". Words are reduced to letters and digits, so
 * tsquery operators typed by a user can't break the query. Null when nothing
 * searchable remains.
 */
export function toPrefixQuery(search: string): string | null {
  const words =
    search
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 8) ?? [];
  return words.length > 0 ? words.map((w) => `${w}:*`).join(" & ") : null;
}

/**
 * The feed, PAGE_SIZE at a time, skipping hidden questions.
 * - Newest first (default): keyset pagination on (created_at, id), so pages
 *   never skip or repeat rows when new questions arrive in between.
 * - With a search: ranked by full-text relevance across titles, question bodies
 *   and answers.
 * - Trending: recent answers (3 pts) and helpful votes (2 pts) from the last 7
 *   days, gently decayed by the question's age in days, so activity outweighs
 *   mere newness.
 * Ranked orders page by offset (`o:<n>`).
 */
export async function fetchQuestionPage(
  sql: Sql,
  query: FeedQuery,
): Promise<QuestionPage> {
  const tsquery = query.search ? toPrefixQuery(query.search) : null;
  const ranked = Boolean(query.search) || query.sort === "trending";

  const keyset =
    !ranked && query.cursor && /^\d+:\d+$/.test(query.cursor)
      ? query.cursor.split(":")
      : [null, null];
  const offset =
    ranked && query.cursor && /^o:\d+$/.test(query.cursor)
      ? Math.min(Number(query.cursor.slice(2)), MAX_OFFSET)
      : 0;
  // Searches made only of symbols or stop words fall back to a title substring match.
  const pattern = query.search
    ? `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    : null;

  const orderBy = query.search
    ? "rank desc, q.created_at desc, q.id desc"
    : query.sort === "trending"
      ? "trend desc, q.created_at desc, q.id desc"
      : "q.created_at desc, q.id desc";

  const rows = await sql.query<
    QuestionRow & { sort_micros: string; rank: number; trend: number }
  >(
    `with tsq as (select to_tsquery('english', coalesce($3::text, '')) as q),
     activity as (
       select question_id, sum(pts)::float as pts from (
         select a.question_id, 3 as pts from answers a
         where a.created_at > now() - interval '7 days' and a.hidden_at is null
         union all
         select a.question_id, 2 as pts from helpful_votes v
         join answers a on a.id = v.answer_id
         where v.created_at > now() - interval '7 days'
       ) recent
       group by question_id
     )
     select ${QUESTION_SELECT.replaceAll("$UID", "$1")},
       (extract(epoch from q.created_at) * 1000000)::bigint::text as sort_micros,
       case when $3::text is null then 0 else
         ts_rank_cd(q.search, tsq.q) + 0.5 * coalesce((
           select max(ts_rank_cd(a.search, tsq.q)) from answers a
           where a.question_id = q.id and a.hidden_at is null and a.search @@ tsq.q
         ), 0)
       end as rank,
       (1 + coalesce(act.pts, 0))
         / power(extract(epoch from now() - q.created_at) / 86400 + 1, 0.8) as trend
     from questions q
     cross join tsq
     left join profiles p on p.user_id = q.user_id
     left join activity act on act.question_id = q.id
     where q.hidden_at is null
       and ($2::text is null or q.category = $2)
       and ($7::text is null or (
         case when numnode(tsq.q) = 0 then q.title ilike $7
         else q.search @@ tsq.q or exists (
           select 1 from answers a
           where a.question_id = q.id and a.hidden_at is null and a.search @@ tsq.q
         ) end
       ))
       and ($6::text <> 'trending' or $7::text is not null
            or q.created_at > now() - interval '30 days' or act.pts is not null)
       and ($4::bigint is null
            or ((extract(epoch from q.created_at) * 1000000)::bigint, q.id) < ($4::bigint, $5::int))
     order by ${orderBy}
     limit ${PAGE_SIZE + 1} offset ${offset}`,
    [
      query.viewerId,
      query.category,
      tsquery,
      keyset[0],
      keyset[1],
      query.sort ?? "new",
      pattern,
    ],
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const more = rows.length > PAGE_SIZE && last;
  return {
    items: page.map(mapQuestion),
    nextCursor: !more
      ? null
      : ranked
        ? offset + PAGE_SIZE <= MAX_OFFSET
          ? `o:${offset + PAGE_SIZE}`
          : null
        : `${last.sort_micros}:${last.id}`,
  };
}

export type QuestionInput = {
  title: string;
  body: string;
  category: string;
  kind: string;
};

/** Rules for a question's text, shared by posting and editing. Null when valid. */
export function validateQuestion(input: QuestionInput): string | null {
  if (input.title.length < 8)
    return "Give the question a title of at least 8 characters.";
  if (input.title.length > 140) return "Keep the title under 140 characters.";
  if (input.body.length < 20)
    return "Add a little more detail so people know how to answer.";
  if (input.body.length > 4000)
    return "That is too long. Keep it under 4000 characters.";
  if (!isCategory(input.category)) return "Pick a category.";
  if (input.kind !== "knowledge" && input.kind !== "experience")
    return "Choose experience or knowledge.";
  return null;
}

/**
 * Edit your own question, any time after posting. Answers stay; readers see
 * "Edited". Questions hidden by moderators can't be edited until reviewed, so
 * an edit can't be used to slip past a report.
 */
export async function updateOwnQuestion(
  sql: Sql,
  userId: string,
  id: number,
  input: QuestionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(id) || id <= 0)
    return { ok: false, error: "That question is missing." };
  const invalid = validateQuestion(input);
  if (invalid) return { ok: false, error: invalid };
  const rows = await sql<{ user_id: string; is_hidden: unknown }>`
    select user_id, (hidden_at is not null) as is_hidden from questions where id = ${id}
  `;
  const current = rows[0];
  if (!current || current.user_id !== userId)
    return { ok: false, error: "You can only edit your own question." };
  if (asBool(current.is_hidden))
    return {
      ok: false,
      error: "This question is hidden while a moderator reviews it, so it can't be edited yet.",
    };
  await sql`
    update questions
    set title = ${input.title},
        body = ${input.body},
        category = ${input.category},
        kind = ${input.kind},
        edited_at = now()
    where id = ${id} and user_id = ${userId}
  `;
  return { ok: true };
}
