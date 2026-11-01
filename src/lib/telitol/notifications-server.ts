import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  listNotifications,
  markRead,
  purgeOldNotifications,
  unreadCount,
  type NotificationItem,
} from "@/lib/telitol/notifications";

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<number> =>
    unreadCount(await getSql(), context.userId),
  );

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<NotificationItem[]> => {
    const sql = await getSql();
    // Opening the list is rare enough to piggyback the cleanup on.
    if (Math.random() < 0.05)
      await purgeOldNotifications(sql).catch(() => undefined);
    return listNotifications(sql, context.userId);
  });

/** Mark one notification read, or all of them when `id` is omitted. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: number } | undefined) => ({
    id: Number.isInteger(input?.id) ? Number(input?.id) : null,
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await markRead(await getSql(), context.userId, data.id);
    return { ok: true };
  });
