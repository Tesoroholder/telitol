import * as Ably from "ably";
import { env } from "@/lib/env.server";

/**
 * Realtime push for Anonymous Connect via Ably (free tier is plenty to start).
 * Server-only: holds ABLY_API_KEY. Browsers get short-lived, subscribe-only
 * tokens for their own user channel and their current room, and send messages
 * through server functions, so moderation and persistence always apply.
 * Without ABLY_API_KEY everything still works; clients fall back to polling.
 */

export const userChannel = (userId: string) => `telitol:user:${userId}`;
export const roomChannel = (roomId: string) => `telitol:room:${roomId}`;

let rest: Ably.Rest | null = null;
function client(): Ably.Rest | null {
  const key = env("ABLY_API_KEY");
  if (!key) return null;
  rest ??= new Ably.Rest({ key });
  return rest;
}

export function realtimeEnabled(): boolean {
  return client() !== null;
}

/** Publish an event; failures are logged, never thrown (polling covers gaps). */
export async function publish(
  channel: string,
  event: string,
  data: unknown,
): Promise<void> {
  const ably = client();
  if (!ably) return;
  try {
    await ably.channels.get(channel).publish(event, data);
  } catch (error) {
    console.error(
      "[realtime] publish failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/** A signed token request the browser exchanges with Ably directly. */
export async function createTokenRequest(
  userId: string,
  roomId: string | null,
): Promise<Ably.TokenRequest | null> {
  const ably = client();
  if (!ably) return null;
  const capability: Record<string, ["subscribe"]> = {
    [userChannel(userId)]: ["subscribe"],
  };
  if (roomId) capability[roomChannel(roomId)] = ["subscribe"];
  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });
}
