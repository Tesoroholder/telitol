import { createAuthClient } from "better-auth/react";

/** Better Auth client for the browser; talks to same-origin `/api/auth/*`. */
export const authClient = createAuthClient();

/**
 * Sign out, then leave the page. Rejects when the server never confirms, so the
 * caller can let the visitor retry instead of showing a sign-out that didn't happen.
 */
export async function signOut(redirectTo = "/login"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
