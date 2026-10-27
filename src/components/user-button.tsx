import { useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";

/** Avatar, name and a sign-out control for the signed-in user. */
export function UserButton() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail), so it can't be fired twice.
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-mint text-sm font-medium text-green">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          void signOut().catch(() => setSigningOut(false));
        }}
        className="ml-auto cursor-pointer text-sm text-muted underline-offset-4 hover:underline disabled:cursor-wait"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
