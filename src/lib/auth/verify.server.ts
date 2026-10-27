import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./server";

/**
 * Server-side session resolution (server-only). The session cookie rides along
 * on every same-origin request, so we resolve the user straight from the request
 * headers. Never trust a client-supplied user id — only this.
 */

/**
 * Thrown when the caller has no valid session. The message is a stable
 * contract — match `err.message === "Unauthorized"` client-side.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/** The signed-in user for the current request, or `null`. */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/** The signed-in user's id, or throw `UnauthorizedError`. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
