import type { Sql } from "../db.ts";

/**
 * Account deletion (Google Play requires it in the app and on the web).
 * Plain functions over `Sql` (no aliases) so tests can run them against a
 * real database.
 *
 * `deleteUserData` removes everything TeliTol stores about one member. Better
 * Auth then deletes the `user` row, which cascades to their sessions and
 * sign-in accounts. Run it inside a transaction so a failure deletes nothing.
 */
export async function deleteUserData(tx: Sql, userId: string): Promise<void> {
  if (!userId || userId.startsWith("seed:") || userId === AI_AUTHOR_ID) {
    throw new Error("That account can't be deleted this way.");
  }

  // Helpful votes they gave: take the count back off other people's answers.
  await tx`
    update answers a
    set helpful = greatest(0, a.helpful - 1)
    from helpful_votes v
    where v.answer_id = a.id and v.user_id = ${userId} and a.user_id <> ${userId}
  `;
  await tx`delete from helpful_votes where user_id = ${userId}`;

  // Their posts. Deleting a question also deletes the answers under it.
  await tx`delete from answers where user_id = ${userId}`;
  await tx`delete from questions where user_id = ${userId}`;

  // Private AI chats.
  await tx`delete from laya_messages where user_id = ${userId}`;
  await tx`delete from laya_threads where user_id = ${userId}`;

  // Anonymous Connect: queue spot, chats they were in, and blocks either way.
  await tx`delete from connect_queue where user_id = ${userId}`;
  await tx`delete from connect_rooms where user_a = ${userId} or user_b = ${userId}`;
  await tx`delete from connect_blocks where user_id = ${userId} or blocked_id = ${userId}`;

  // Notifications, reports they filed or that were about them, rate-limit counters.
  await tx`delete from notifications where user_id = ${userId}`;
  await tx`delete from reports where reporter_id = ${userId} or target_user_id = ${userId}`;
  await tx`delete from app_rate_limits where right(key, ${userId.length + 1}) = ${`:${userId}`}`;

  // Pending password-reset tokens point at the user id.
  await tx`delete from verification where value = ${userId}`;

  // Photo and file records (the files themselves are deleted from storage by
  // the caller, using imageUrlsOf() and attachmentUrlsOf() read before this runs).
  await tx`update profiles set avatar_image_id = null where user_id = ${userId}`;
  await tx`delete from images where user_id = ${userId}`;
  await tx`delete from attachments where user_id = ${userId}`;

  await tx`delete from profiles where user_id = ${userId}`;
}

/** Author id stored on reports about AI replies. Never a real member. */
export const AI_AUTHOR_ID = "ai";
