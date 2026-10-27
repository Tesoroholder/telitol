import { createServerFn } from "@tanstack/react-start";
import { getSql, withTransaction } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  blockPartner,
  getState,
  joinQueue,
  leave,
  listMessages,
  purgeOld,
  sendMessage,
  type ConnectState,
  type RoomMessages,
  type SendResult,
} from "@/lib/telitol/connect";
import {
  fileReport,
  isReportReason,
  suspensionMessage,
} from "@/lib/telitol/moderation";
import { allowAction, SLOW_DOWN } from "@/lib/telitol/rate-limit";
import { isCategory } from "@/lib/telitol/shared";

type Err = { ok: false; error: string };

// Realtime is optional and server-only, so it is imported lazily inside handlers.
const realtime = () => import("@/lib/telitol/realtime.server");

export const getConnectState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({ context }): Promise<ConnectState & { realtime: boolean }> => {
      const sql = await getSql();
      const { realtimeEnabled } = await realtime();
      return {
        ...(await getState(sql, context.userId)),
        realtime: realtimeEnabled(),
      };
    },
  );

export const joinConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { topic?: string | null }) => ({
    topic:
      typeof input?.topic === "string" && isCategory(input.topic)
        ? input.topic
        : null,
  }))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ ok: true; state: ConnectState } | Err> => {
      const sql = await getSql();
      const suspended = await suspensionMessage(sql, context.userId);
      if (suspended) return { ok: false, error: suspended };
      if (!(await allowAction(sql, "connectJoin", context.userId)))
        return { ok: false, error: SLOW_DOWN };
      await purgeOld(sql);
      const result = await withTransaction((tx) =>
        joinQueue(tx, context.userId, data.topic),
      );
      if (result.status === "waiting") {
        return { ok: true, state: await getState(sql, context.userId) };
      }
      const { publish, userChannel } = await realtime();
      await publish(userChannel(result.partnerId), "matched", {
        roomId: result.room.id,
      });
      return { ok: true, state: { status: "in_room", room: result.room } };
    },
  );

export const leaveConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const ended = await leave(sql, context.userId);
    if (ended) {
      const { publish, roomChannel } = await realtime();
      await publish(roomChannel(ended.roomId), "ended", {});
    }
    return { ok: true };
  });

export const sendConnectMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { roomId?: string; body?: string }) => ({
    roomId: typeof input?.roomId === "string" ? input.roomId : "",
    body: typeof input?.body === "string" ? input.body : "",
  }))
  .handler(async ({ context, data }): Promise<SendResult> => {
    const sql = await getSql();
    const suspended = await suspensionMessage(sql, context.userId);
    if (suspended) return { ok: false, error: suspended };
    if (!(await allowAction(sql, "connectMessage", context.userId)))
      return { ok: false, error: SLOW_DOWN };
    const result = await sendMessage(
      sql,
      context.userId,
      data.roomId,
      data.body,
    );
    if (result.ok) {
      const { publish, roomChannel } = await realtime();
      // Receivers fetch the message themselves, so the sender id never leaves the server.
      await publish(roomChannel(data.roomId), "message", {
        id: result.message.id,
      });
    }
    return result;
  });

export const listConnectMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { roomId?: string; afterId?: number }) => ({
    roomId: typeof input?.roomId === "string" ? input.roomId : "",
    afterId: Number.isInteger(input?.afterId) ? Number(input.afterId) : 0,
  }))
  .handler(async ({ context, data }): Promise<RoomMessages> => {
    const sql = await getSql();
    return listMessages(sql, context.userId, data.roomId, data.afterId);
  });

export const blockConnectPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { roomId?: string }) => ({
    roomId: typeof input?.roomId === "string" ? input.roomId : "",
  }))
  .handler(async ({ context, data }): Promise<{ ok: true } | Err> => {
    const sql = await getSql();
    const blocked = await blockPartner(sql, context.userId, data.roomId);
    if (!blocked) return { ok: false, error: "That chat isn't available." };
    const { publish, roomChannel } = await realtime();
    await publish(roomChannel(data.roomId), "ended", {});
    return { ok: true };
  });

export const reportConnectRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { roomId?: string; reason?: string; details?: string }) => ({
      roomId: typeof input?.roomId === "string" ? input.roomId : "",
      reason: isReportReason(input?.reason) ? input.reason : "other",
      details: typeof input?.details === "string" ? input.details : "",
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!(await allowAction(sql, "report", context.userId)))
      return { ok: false as const, error: SLOW_DOWN };
    return fileReport(sql, {
      reporterId: context.userId,
      targetType: "connect_room",
      targetId: data.roomId,
      reason: data.reason,
      details: data.details,
    });
  });

/** Signed Ably token request for this user's channels, or null when realtime is off. */
export const getRealtimeToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const state = await getState(sql, context.userId);
    const { createTokenRequest } = await realtime();
    const token = await createTokenRequest(
      context.userId,
      state.status === "in_room" ? state.room.id : null,
    );
    return token ? JSON.parse(JSON.stringify(token)) : null;
  });
