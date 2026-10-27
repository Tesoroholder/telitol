import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";

/**
 * Anonymous Connect: match two strangers into a short, timed chat. Plain
 * functions over `Sql` so tests can run them against PGLite. Realtime delivery
 * (Ably) is layered on top in `connect-server.ts`; everything here works with
 * polling alone.
 */

export const ROOM_MINUTES = 15;
/** Queue entries older than this are treated as abandoned. */
export const QUEUE_STALE_MINUTES = 10;
/** Connect messages are deleted after this many days. */
export const RETENTION_DAYS = 7;
export const MAX_MESSAGE_LENGTH = 1000;

const ADJECTIVES = [
  "Quiet",
  "Bright",
  "Gentle",
  "Steady",
  "Curious",
  "Kind",
  "Brave",
  "Calm",
  "Warm",
  "Patient",
];
const NOUNS = [
  "Kite",
  "River",
  "Lantern",
  "Sparrow",
  "Harbor",
  "Maple",
  "Comet",
  "Meadow",
  "Pebble",
  "Willow",
];

function alias(): string {
  const pick = (list: string[]) =>
    list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

export type RoomView = {
  id: string;
  myAlias: string;
  partnerAlias: string;
  topic: string | null;
  expiresAt: string;
  endedAt: string | null;
};

export type ConnectState =
  | { status: "idle" }
  | { status: "waiting"; topic: string | null; since: string }
  | { status: "in_room"; room: RoomView };

type RoomRow = {
  id: string;
  user_a: string;
  user_b: string;
  alias_a: string;
  alias_b: string;
  topic: string | null;
  expires_at: string;
  ended_at: string | null;
};

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

function view(row: RoomRow, userId: string): RoomView {
  const mine = row.user_a === userId;
  return {
    id: row.id,
    myAlias: mine ? row.alias_a : row.alias_b,
    partnerAlias: mine ? row.alias_b : row.alias_a,
    topic: row.topic,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
  };
}

async function activeRoom(sql: Sql, userId: string): Promise<RoomRow | null> {
  const rows = await sql.query<RoomRow>(
    `select id, user_a, user_b, alias_a, alias_b, topic,
            to_char(expires_at at time zone 'utc', ${ISO}) as expires_at,
            to_char(ended_at at time zone 'utc', ${ISO}) as ended_at
     from connect_rooms
     where (user_a = $1 or user_b = $1) and ended_at is null and expires_at > now()
     order by created_at desc
     limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** A room the user belongs to (active or not), or null. */
async function memberRoom(
  sql: Sql,
  userId: string,
  roomId: string,
): Promise<RoomRow | null> {
  const rows = await sql.query<RoomRow>(
    `select id, user_a, user_b, alias_a, alias_b, topic,
            to_char(expires_at at time zone 'utc', ${ISO}) as expires_at,
            to_char(ended_at at time zone 'utc', ${ISO}) as ended_at
     from connect_rooms
     where id = $2 and (user_a = $1 or user_b = $1)`,
    [userId, roomId],
  );
  return rows[0] ?? null;
}

function isActive(row: RoomRow): boolean {
  return !row.ended_at && Date.parse(row.expires_at) > Date.now();
}

export async function getState(
  sql: Sql,
  userId: string,
): Promise<ConnectState> {
  const room = await activeRoom(sql, userId);
  if (room) return { status: "in_room", room: view(room, userId) };
  const queued = await sql<{ topic: string | null; since: string }>`
    select topic, to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as since
    from connect_queue
    where user_id = ${userId} and joined_at > now() - make_interval(mins => ${QUEUE_STALE_MINUTES}::int)
  `;
  if (queued[0])
    return {
      status: "waiting",
      topic: queued[0].topic,
      since: queued[0].since,
    };
  return { status: "idle" };
}

export type JoinResult =
  | { status: "waiting" }
  | { status: "matched"; room: RoomView; partnerId: string };

/**
 * Join the queue. If someone compatible is already waiting, match with them
 * immediately. Run inside a transaction: `for update skip locked` stops two
 * joiners from grabbing the same partner.
 */
export async function joinQueue(
  tx: Sql,
  userId: string,
  topic: string | null,
): Promise<JoinResult> {
  await tx`delete from connect_queue where joined_at < now() - make_interval(mins => ${QUEUE_STALE_MINUTES}::int)`;

  const existing = await activeRoom(tx, userId);
  if (existing) {
    const partnerId =
      existing.user_a === userId ? existing.user_b : existing.user_a;
    return { status: "matched", room: view(existing, userId), partnerId };
  }

  const partners = await tx<{ user_id: string; topic: string | null }>`
    select q.user_id, q.topic
    from connect_queue q
    where q.user_id <> ${userId}
      and (q.topic is null or ${topic}::text is null or q.topic = ${topic}::text)
      and not exists (
        select 1 from connect_blocks b
        where (b.user_id = ${userId} and b.blocked_id = q.user_id)
           or (b.user_id = q.user_id and b.blocked_id = ${userId})
      )
      and not exists (
        select 1 from profiles p where p.user_id = q.user_id and p.suspended_until > now()
      )
    order by q.joined_at
    limit 1
    for update skip locked
  `;
  const partner = partners[0];
  if (!partner) {
    await tx`
      insert into connect_queue (user_id, topic) values (${userId}, ${topic})
      on conflict (user_id) do update set topic = excluded.topic, joined_at = now()
    `;
    return { status: "waiting" };
  }

  await tx`delete from connect_queue where user_id in (${userId}, ${partner.user_id})`;
  const aliasA = alias();
  let aliasB = alias();
  while (aliasB === aliasA) aliasB = alias();
  const id = randomUUID();
  await tx`
    insert into connect_rooms (id, user_a, user_b, alias_a, alias_b, topic, expires_at)
    values (${id}, ${partner.user_id}, ${userId}, ${aliasA}, ${aliasB}, ${topic ?? partner.topic},
            now() + make_interval(mins => ${ROOM_MINUTES}::int))
  `;
  const room = await memberRoom(tx, userId, id);
  if (!room) throw new Error("room vanished after insert");
  return {
    status: "matched",
    room: view(room, userId),
    partnerId: partner.user_id,
  };
}

/** Leave the queue and end any active room. Returns the ended room's partner, if any. */
export async function leave(
  sql: Sql,
  userId: string,
): Promise<{ roomId: string; partnerId: string } | null> {
  await sql`delete from connect_queue where user_id = ${userId}`;
  const room = await activeRoom(sql, userId);
  if (!room) return null;
  await sql`update connect_rooms set ended_at = now(), ended_by = ${userId} where id = ${room.id} and ended_at is null`;
  return {
    roomId: room.id,
    partnerId: room.user_a === userId ? room.user_b : room.user_a,
  };
}

export type ConnectMessage = {
  id: number;
  body: string;
  mine: boolean;
  createdAt: string;
};

export type SendResult =
  { ok: true; message: ConnectMessage } | { ok: false; error: string };

export async function sendMessage(
  sql: Sql,
  userId: string,
  roomId: string,
  rawBody: string,
): Promise<SendResult> {
  const body = rawBody.trim();
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_MESSAGE_LENGTH)
    return { ok: false, error: "That message is too long." };
  const room = await memberRoom(sql, userId, roomId);
  if (!room) return { ok: false, error: "That chat isn't available." };
  if (!isActive(room)) return { ok: false, error: "This chat has ended." };
  const rows = await sql<{ id: number; created_at: string }>`
    insert into connect_messages (room_id, sender_id, body)
    values (${roomId}, ${userId}, ${body})
    returning id, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
  `;
  const row = rows[0];
  return {
    ok: true,
    message: {
      id: Number(row.id),
      body,
      mine: true,
      createdAt: row.created_at,
    },
  };
}

export type RoomMessages = {
  room: RoomView;
  active: boolean;
  messages: ConnectMessage[];
} | null;

/** Messages after `afterId` in a room the user belongs to. */
export async function listMessages(
  sql: Sql,
  userId: string,
  roomId: string,
  afterId: number,
): Promise<RoomMessages> {
  const room = await memberRoom(sql, userId, roomId);
  if (!room) return null;
  const rows = await sql<{
    id: number;
    body: string;
    sender_id: string;
    created_at: string;
  }>`
    select id, body, sender_id,
           to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from connect_messages
    where room_id = ${roomId} and id > ${afterId}
    order by id
    limit 200
  `;
  return {
    room: view(room, userId),
    active: isActive(room),
    messages: rows.map((row) => ({
      id: Number(row.id),
      body: row.body,
      mine: row.sender_id === userId,
      createdAt: row.created_at,
    })),
  };
}

/** Block the other person in a room (never matched again) and end the room. */
export async function blockPartner(
  sql: Sql,
  userId: string,
  roomId: string,
): Promise<{ partnerId: string } | null> {
  const room = await memberRoom(sql, userId, roomId);
  if (!room) return null;
  const partnerId = room.user_a === userId ? room.user_b : room.user_a;
  await sql`insert into connect_blocks (user_id, blocked_id) values (${userId}, ${partnerId}) on conflict do nothing`;
  await sql`update connect_rooms set ended_at = coalesce(ended_at, now()), ended_by = ${userId} where id = ${roomId}`;
  return { partnerId };
}

/** Delete old Connect messages and rooms. Cheap enough to run on each join. */
export async function purgeOld(sql: Sql): Promise<void> {
  await sql`
    delete from connect_rooms
    where created_at < now() - make_interval(days => ${RETENTION_DAYS}::int)
      and not exists (
        select 1 from reports r
        where r.target_type = 'connect_room' and r.target_id = connect_rooms.id and r.status = 'open'
      )
  `;
}
