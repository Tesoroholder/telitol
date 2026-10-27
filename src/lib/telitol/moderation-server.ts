import { createServerFn } from "@tanstack/react-start";
import { getSql, withTransaction } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  fileReport,
  getRole,
  isModerator,
  isReportReason,
  listOpenReports,
  resolveReports,
  type ReportGroup,
  type ReportResult,
  type ResolveInput,
  type Role,
} from "@/lib/telitol/moderation";
import { allowAction, SLOW_DOWN } from "@/lib/telitol/rate-limit";

type Err = { ok: false; error: string };

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Role> =>
    getRole(await getSql(), context.userId),
  );

/** Report a question or answer. */
export const reportContent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      targetType?: string;
      targetId?: number;
      reason?: string;
      details?: string;
    }) => ({
      targetType:
        input?.targetType === "answer"
          ? ("answer" as const)
          : ("question" as const),
      targetId: Number(input?.targetId),
      reason: isReportReason(input?.reason) ? input.reason : "other",
      details: typeof input?.details === "string" ? input.details : "",
    }),
  )
  .handler(async ({ context, data }): Promise<ReportResult> => {
    if (!Number.isInteger(data.targetId) || data.targetId <= 0) {
      return { ok: false, error: "That isn't available to report." };
    }
    const sql = await getSql();
    if (!(await allowAction(sql, "report", context.userId)))
      return { ok: false, error: SLOW_DOWN };
    return fileReport(sql, {
      reporterId: context.userId,
      targetType: data.targetType,
      targetId: String(data.targetId),
      reason: data.reason,
      details: data.details,
    });
  });

export const listReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{ ok: true; reports: ReportGroup[] } | Err> => {
      const sql = await getSql();
      if (!(await isModerator(sql, context.userId)))
        return { ok: false, error: "Moderators only." };
      return { ok: true, reports: await listOpenReports(sql) };
    },
  );

export const resolveReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      targetType?: string;
      targetId?: string;
      action?: string;
      suspendDays?: number;
      note?: string;
    }): Omit<ResolveInput, "moderatorId"> => ({
      targetType:
        input?.targetType === "answer" || input?.targetType === "connect_room"
          ? input.targetType
          : "question",
      targetId: typeof input?.targetId === "string" ? input.targetId : "",
      action:
        input?.action === "hide" || input?.action === "restore"
          ? input.action
          : "dismiss",
      suspendDays: Number.isFinite(input?.suspendDays)
        ? Number(input.suspendDays)
        : 0,
      note: typeof input?.note === "string" ? input.note : "",
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    const sql = await getSql();
    if (!(await isModerator(sql, context.userId)))
      return { ok: false, error: "Moderators only." };
    if (!data.targetId) return { ok: false, error: "Pick a report." };
    await withTransaction((tx) =>
      resolveReports(tx, { moderatorId: context.userId, ...data }),
    );
    return { ok: true };
  });
