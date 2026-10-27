import type { Sql } from "../db.ts";

/**
 * Reports, auto-hiding and moderator actions. Plain functions over `Sql` (no
 * server-function or alias imports) so tests can run them against PGLite.
 */

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "self_harm",
  "misinformation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTarget = "question" | "answer" | "connect_room";
export type Role = "member" | "moderator" | "admin";

/** Distinct reporters needed before a question or answer is hidden automatically. */
export const AUTO_HIDE_THRESHOLD = 3;

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

/** Emails listed in ADMIN_EMAILS (comma separated) are admins without any SQL. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getRole(sql: Sql, userId: string): Promise<Role> {
  const rows = await sql<{ role: string | null; email: string | null }>`
    select p.role, u.email
    from (select ${userId}::text as id) me
    left join profiles p on p.user_id = me.id
    left join "user" u on u.id = me.id
  `;
  const row = rows[0];
  if (row?.email && adminEmails().includes(row.email.toLowerCase()))
    return "admin";
  return row?.role === "admin" || row?.role === "moderator"
    ? row.role
    : "member";
}

export async function isModerator(sql: Sql, userId: string): Promise<boolean> {
  return (await getRole(sql, userId)) !== "member";
}

/** A message to show a suspended member, or null when they may post. */
export async function suspensionMessage(
  sql: Sql,
  userId: string,
): Promise<string | null> {
  const rows = await sql<{ until: string }>`
    select to_char(suspended_until at time zone 'utc', 'YYYY-MM-DD') as until
    from profiles
    where user_id = ${userId} and suspended_until > now()
  `;
  const until = rows[0]?.until;
  return until
    ? `Your account can't post until ${until} after a moderation review.`
    : null;
}

/** The author of a report target, or null when it doesn't exist / isn't reportable by this user. */
async function targetOwner(
  sql: Sql,
  type: ReportTarget,
  id: string,
  reporterId: string,
): Promise<string | null> {
  if (type === "question") {
    const rows = await sql<{
      user_id: string;
    }>`select user_id from questions where id = ${Number(id)}`;
    return rows[0]?.user_id ?? null;
  }
  if (type === "answer") {
    const rows = await sql<{
      user_id: string;
    }>`select user_id from answers where id = ${Number(id)}`;
    return rows[0]?.user_id ?? null;
  }
  // A Connect room: only its two participants can report it, and the target is the other one.
  const rows = await sql<{ user_a: string; user_b: string }>`
    select user_a, user_b from connect_rooms where id = ${id}
  `;
  const room = rows[0];
  if (!room) return null;
  if (room.user_a === reporterId) return room.user_b;
  if (room.user_b === reporterId) return room.user_a;
  return null;
}

export type ReportInput = {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string;
};

export type ReportResult =
  { ok: true; hidden: boolean } | { ok: false; error: string };

/**
 * File a report (once per reporter per target). Once AUTO_HIDE_THRESHOLD people
 * have open reports on a question or answer, it is hidden pending review.
 */
export async function fileReport(
  sql: Sql,
  input: ReportInput,
): Promise<ReportResult> {
  const owner = await targetOwner(
    sql,
    input.targetType,
    input.targetId,
    input.reporterId,
  );
  if (!owner) return { ok: false, error: "That isn't available to report." };
  if (owner === input.reporterId)
    return { ok: false, error: "You can't report your own post." };
  await sql`
    insert into reports (reporter_id, target_type, target_id, target_user_id, reason, details)
    values (${input.reporterId}, ${input.targetType}, ${input.targetId}, ${owner},
            ${input.reason}, ${input.details.slice(0, 1000)})
    on conflict (reporter_id, target_type, target_id) do nothing
  `;
  if (input.targetType === "connect_room") return { ok: true, hidden: false };

  const counted = await sql<{ n: number }>`
    select count(distinct reporter_id)::int as n from reports
    where target_type = ${input.targetType} and target_id = ${input.targetId} and status = 'open'
  `;
  if (Number(counted[0]?.n ?? 0) < AUTO_HIDE_THRESHOLD)
    return { ok: true, hidden: false };
  const reason = `auto: ${AUTO_HIDE_THRESHOLD}+ reports`;
  if (input.targetType === "question") {
    await sql`update questions set hidden_at = now(), hidden_reason = ${reason}
              where id = ${Number(input.targetId)} and hidden_at is null`;
  } else {
    await sql`update answers set hidden_at = now(), hidden_reason = ${reason}
              where id = ${Number(input.targetId)} and hidden_at is null`;
  }
  return { ok: true, hidden: true };
}

export type ReportGroup = {
  targetType: ReportTarget;
  targetId: string;
  targetUserId: string;
  authorName: string;
  reportCount: number;
  reasons: string[];
  details: string[];
  preview: string;
  questionId: number | null;
  hidden: boolean;
  /** Earlier reports against this author that moderators upheld. */
  priorActioned: number;
  latestAt: string;
};

/** Open reports grouped by target, most reported first. */
export async function listOpenReports(sql: Sql): Promise<ReportGroup[]> {
  const rows = await sql<{
    target_type: ReportTarget;
    target_id: string;
    target_user_id: string;
    author_name: string | null;
    report_count: number;
    reasons: string[];
    details: string[];
    preview: string | null;
    question_id: number | null;
    hidden: boolean | null;
    prior_actioned: number;
    latest_at: string;
  }>`
    select
      r.target_type,
      r.target_id,
      r.target_user_id,
      p.display_name as author_name,
      count(*)::int as report_count,
      array_agg(distinct r.reason) as reasons,
      array_remove(array_agg(nullif(r.details, '')), null) as details,
      case r.target_type
        when 'question' then (select q.title || E'\n\n' || q.body from questions q where q.id::text = r.target_id)
        when 'answer' then (select a.body from answers a where a.id::text = r.target_id)
        else (
          select string_agg(m.body, E'\n' order by m.id)
          from (select body, id from connect_messages
                where room_id = r.target_id and sender_id = r.target_user_id
                order by id desc limit 10) m
        )
      end as preview,
      case r.target_type
        when 'question' then r.target_id::int
        when 'answer' then (select a.question_id from answers a where a.id::text = r.target_id)
      end as question_id,
      case r.target_type
        when 'question' then (select q.hidden_at is not null from questions q where q.id::text = r.target_id)
        when 'answer' then (select a.hidden_at is not null from answers a where a.id::text = r.target_id)
        else false
      end as hidden,
      (select count(*)::int from reports past
        where past.target_user_id = r.target_user_id and past.status = 'actioned') as prior_actioned,
      to_char(max(r.created_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as latest_at
    from reports r
    left join profiles p on p.user_id = r.target_user_id
    where r.status = 'open'
    group by r.target_type, r.target_id, r.target_user_id, p.display_name
    order by count(*) desc, max(r.created_at) desc
    limit 100
  `;
  return rows.map((row) => ({
    targetType: row.target_type,
    targetId: row.target_id,
    targetUserId: row.target_user_id,
    authorName: row.author_name ?? "Member",
    reportCount: Number(row.report_count),
    reasons: row.reasons ?? [],
    details: row.details ?? [],
    preview: (row.preview ?? "(content was deleted)").slice(0, 1500),
    questionId: row.question_id == null ? null : Number(row.question_id),
    hidden: Boolean(row.hidden),
    priorActioned: Number(row.prior_actioned ?? 0),
    latestAt: row.latest_at,
  }));
}

export type ResolveInput = {
  moderatorId: string;
  targetType: ReportTarget;
  targetId: string;
  /** hide: uphold and hide; restore: un-hide and dismiss; dismiss: no action. */
  action: "hide" | "restore" | "dismiss";
  /** Also suspend the author for this many days (0 = no suspension). */
  suspendDays: number;
  note: string;
};

/** Apply a moderator decision to every open report on one target. Run inside a transaction. */
export async function resolveReports(
  tx: Sql,
  input: ResolveInput,
): Promise<void> {
  const { targetType, targetId } = input;
  const numericId = Number(targetId);
  if (targetType === "question" && input.action !== "dismiss") {
    if (input.action === "hide") {
      await tx`update questions set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'moderator' where id = ${numericId}`;
    } else {
      await tx`update questions set hidden_at = null, hidden_reason = null where id = ${numericId}`;
    }
  }
  if (targetType === "answer" && input.action !== "dismiss") {
    if (input.action === "hide") {
      await tx`update answers set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'moderator' where id = ${numericId}`;
    } else {
      await tx`update answers set hidden_at = null, hidden_reason = null where id = ${numericId}`;
    }
  }
  if (targetType === "connect_room" && input.action === "hide") {
    await tx`update connect_rooms set ended_at = coalesce(ended_at, now()), ended_by = 'moderator' where id = ${targetId}`;
  }

  const owners = await tx<{ target_user_id: string }>`
    update reports
    set status = ${input.action === "hide" ? "actioned" : "dismissed"},
        resolved_by = ${input.moderatorId},
        resolved_at = now()
    where target_type = ${targetType} and target_id = ${targetId} and status = 'open'
    returning target_user_id
  `;
  const owner = owners[0]?.target_user_id;
  const days = Math.max(0, Math.min(365, Math.floor(input.suspendDays)));
  if (owner && days > 0) {
    await tx`
      insert into profiles (user_id, display_name, suspended_until)
      values (${owner}, 'Member', now() + make_interval(days => ${days}::int))
      on conflict (user_id) do update
        set suspended_until = greatest(coalesce(profiles.suspended_until, now()), now() + make_interval(days => ${days}::int))
    `;
  }
  await tx`
    insert into moderation_actions (moderator_id, action, target_type, target_id, note)
    values (${input.moderatorId}, ${days > 0 ? `${input.action}+suspend:${days}d` : input.action},
            ${targetType}, ${targetId}, ${input.note.slice(0, 500)})
  `;
}
