import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions — the standard way to get the caller's
 * verified user id. Scope every per-user query by `context.userId`.
 *
 *   export const listMine = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       const sql = await getSql();
 *       return sql`select * from questions where user_id = ${context.userId}`;
 *     });
 *
 * Signed out -> throws `UnauthorizedError` (see `verify.server.ts`).
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // Only `*.server` modules here, so Vite never ships server code to the browser.
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    assertSameSiteRequest();
    const userId = await requireUserId();
    return next({ context: { userId } });
  },
);
