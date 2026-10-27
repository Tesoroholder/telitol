import type { Sql } from "@/lib/db";

/** Per-user limits for write actions: `max` hits per `windowSeconds`. */
export const LIMITS = {
  question: { max: 10, windowSeconds: 3600 },
  answer: { max: 30, windowSeconds: 3600 },
  vote: { max: 120, windowSeconds: 3600 },
  ai: { max: 30, windowSeconds: 3600 },
  report: { max: 20, windowSeconds: 3600 },
  connectJoin: { max: 20, windowSeconds: 3600 },
  connectMessage: { max: 60, windowSeconds: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * Count one hit against `name` for `userId` and report whether it is allowed.
 * A fixed window kept in Postgres, so every serverless instance shares it. The
 * upsert is a single statement, so concurrent hits can't both slip through.
 */
export async function allowAction(
  sql: Sql,
  name: LimitName,
  userId: string,
): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const rows = await sql<{ count: number }>`
    insert into app_rate_limits (key, count, window_start)
    values (${`${name}:${userId}`}, 1, now())
    on conflict (key) do update set
      count = case
        when app_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int)
          then 1
        else app_rate_limits.count + 1
      end,
      window_start = case
        when app_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int)
          then now()
        else app_rate_limits.window_start
      end
    returning count
  `;
  return Number(rows[0]?.count ?? 0) <= max;
}

export const SLOW_DOWN =
  "You're going a bit fast. Take a breath and try again in a little while.";
