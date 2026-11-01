import type { Sql } from "../db.ts";

/**
 * In-app notifications. Plain functions over `Sql` so they can run inside the
 * same transaction as the action that triggers them, and in PGLite tests.
 */

export type NotificationKind =
  "answer" | "best" | "helpful" | "hidden" | "suspended";

export type NotificationItem = {
  id: number;
  kind: NotificationKind;
  questionId: number | null;
  questionTitle: string | null;
  actorName: string;
  count: number;
  read: boolean;
  createdAt: string;
};

type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  questionId?: number | null;
  answerId?: number | null;
  actorName?: string;
};

/** Record a notification. Seed users never get one; helpful votes on one answer stack. */
export async function notify(sql: Sql, input: NotifyInput): Promise<void> {
  if (!input.userId || input.userId.startsWith("seed:")) return;
  if (input.kind === "helpful") {
    await sql`
      insert into notifications (user_id, kind, question_id, answer_id, actor_name)
      values (${input.userId}, 'helpful', ${input.questionId ?? null}, ${input.answerId ?? null}, ${input.actorName ?? ""})
      on conflict (user_id, answer_id) where kind = 'helpful' and read_at is null
      do update set count = notifications.count + 1, created_at = now(), actor_name = excluded.actor_name
    `;
    return;
  }
  await sql`
    insert into notifications (user_id, kind, question_id, answer_id, actor_name)
    values (${input.userId}, ${input.kind}, ${input.questionId ?? null}, ${input.answerId ?? null}, ${input.actorName ?? ""})
  `;
}

export async function unreadCount(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from notifications where user_id = ${userId} and read_at is null
  `;
  return Number(rows[0]?.n ?? 0);
}

/** Newest 50 notifications, with the question title for display. */
export async function listNotifications(
  sql: Sql,
  userId: string,
): Promise<NotificationItem[]> {
  const rows = await sql<{
    id: number;
    kind: NotificationKind;
    question_id: number | null;
    question_title: string | null;
    actor_name: string;
    count: number;
    read: boolean;
    created_at: string;
  }>`
    select n.id, n.kind, n.question_id, q.title as question_title, n.actor_name, n.count,
           n.read_at is not null as read,
           to_char(n.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from notifications n
    left join questions q on q.id = n.question_id
    where n.user_id = ${userId}
    order by n.created_at desc, n.id desc
    limit 50
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    questionId: row.question_id == null ? null : Number(row.question_id),
    questionTitle: row.question_title,
    actorName: row.actor_name,
    count: Number(row.count),
    read: row.read === true || (row.read as unknown) === "t",
    createdAt: row.created_at,
  }));
}

/** Mark one notification read, or all of them when `id` is null. */
export async function markRead(
  sql: Sql,
  userId: string,
  id: number | null,
): Promise<void> {
  if (id == null) {
    await sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  } else {
    await sql`update notifications set read_at = now() where user_id = ${userId} and id = ${id} and read_at is null`;
  }
}

/** Notifications older than 90 days are deleted. Cheap; run occasionally. */
export async function purgeOldNotifications(sql: Sql): Promise<void> {
  await sql`delete from notifications where created_at < now() - interval '90 days'`;
}
