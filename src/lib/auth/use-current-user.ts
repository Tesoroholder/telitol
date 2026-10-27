import { authClient } from "./client";

/** Normalized user shape used across the app. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state. Wait out `isPending` before redirecting on
 * `user: null`, or signed-in visitors bounce to sign-in on every hard reload.
 */
export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
        }
      : null,
    isPending,
  };
}

/** `useCurrentUserState().user` for display. `null` means loading OR signed out. */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
