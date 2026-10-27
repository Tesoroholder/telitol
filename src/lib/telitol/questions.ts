import type { Sql } from "../db.ts";
import type { QuestionCard, QuestionKind, QuestionPage } from "./shared.ts";

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
  created_at: string;
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
    createdAt: row.created_at,
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
  (select count(*)::int from answers a where a.question_id = q.id and a.hidden_at is null) as answer_count,
  to_char(q.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
`;

export const PAGE_SIZE = 20;

export type FeedQuery = {
  viewerId: string;
  /** `nextCursor` from the previous page: microsecond timestamp + id. */
  cursor: string | null;
  category: string | null;
  search: string;
};

/**
 * Newest-first feed, PAGE_SIZE at a time, skipping hidden questions. Keyset
 * pagination on (created_at, id), so pages never skip or repeat rows when new
 * questions arrive in between.
 */
export async function fetchQuestionPage(
  sql: Sql,
  query: FeedQuery,
): Promise<QuestionPage> {
  const valid = query.cursor && /^\d+:\d+$/.test(query.cursor);
  const [cursorMicros, cursorId] = valid
    ? (query.cursor as string).split(":")
    : [null, null];
  const pattern = query.search
    ? `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    : null;
  const rows = await sql.query<QuestionRow & { sort_micros: string }>(
    `select ${QUESTION_SELECT.replaceAll("$UID", "$1")},
       (extract(epoch from q.created_at) * 1000000)::bigint::text as sort_micros
     from questions q
     left join profiles p on p.user_id = q.user_id
     where q.hidden_at is null
       and ($2::text is null or q.category = $2)
       and ($3::text is null or q.title ilike $3 or q.body ilike $3)
       and ($4::bigint is null
            or ((extract(epoch from q.created_at) * 1000000)::bigint, q.id) < ($4::bigint, $5::int))
     order by q.created_at desc, q.id desc
     limit ${PAGE_SIZE + 1}`,
    [query.viewerId, query.category, pattern, cursorMicros, cursorId],
  );
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map(mapQuestion),
    nextCursor:
      rows.length > PAGE_SIZE && last ? `${last.sort_micros}:${last.id}` : null,
  };
}
