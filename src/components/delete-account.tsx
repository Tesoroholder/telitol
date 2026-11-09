import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { getAccountInfo } from "@/lib/telitol/server";
import { ErrorNote, SecondaryButton, TextField } from "@/components/fields";

const CONFIRM_WORD = "DELETE";

/** Everything that goes when an account is deleted. Shared with /delete-account. */
export const DELETED_ITEMS = [
  "Your profile, name and reputation",
  "Questions you asked, and the answers under them",
  "Answers you wrote and helpful votes you gave",
  "Your private AI chats",
  "Your Connect chats, blocks and place in the queue",
  "Your notifications and the reports you filed",
  "Your sign-in details, including Google or X sign-in",
] as const;

function messageFor(code: string | undefined, fallback: string): string {
  if (code === "INVALID_PASSWORD") return "That password isn't right.";
  if (code === "SESSION_EXPIRED")
    return "For your safety, sign out, sign back in, then delete your account within a day.";
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND")
    return "Leave the password empty: you sign in with Google or X.";
  return fallback || "Couldn't delete your account. Try again.";
}

/** "Delete account" section for the You page. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Arriving from the public /delete-account page opens the form straight away.
  useEffect(() => {
    if (window.location.hash === "#delete-account") setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || hasPassword !== null) return;
    void getAccountInfo()
      .then((info) => setHasPassword(info.hasPassword))
      .catch(() => setHasPassword(true));
  }, [open, hasPassword]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (confirm.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Type ${CONFIRM_WORD} to confirm.`);
      return;
    }
    if (hasPassword && !password) {
      setError("Enter your password.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.deleteUser(
        hasPassword ? { password } : {},
      );
      if (result.error) {
        setError(messageFor(result.error.code, result.error.message ?? ""));
        return;
      }
      window.location.href = "/delete-account?done=1";
    } catch {
      setError("Couldn't delete your account. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="delete-account"
      className="space-y-3 rounded-3xl border border-line bg-card p-4"
    >
      <h2 className="text-lg font-semibold">Delete account</h2>
      {!open ? (
        <>
          <p className="text-sm text-muted">
            Permanently delete your TeliTol account and everything you've posted.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-semibold text-danger hover:underline"
          >
            Delete my account…
          </button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <p className="text-sm">
            This can't be undone. We delete straight away:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {DELETED_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {hasPassword ? (
            <TextField
              label="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          ) : null}
          <TextField
            label={`Type ${CONFIRM_WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <ErrorNote message={error} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || hasPassword === null}
              className="inline-flex h-12 items-center justify-center rounded-full bg-danger px-5 text-base font-semibold text-on-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete my account"}
            </button>
            <SecondaryButton
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setPassword("");
                setConfirm("");
                setError("");
              }}
            >
              Cancel
            </SecondaryButton>
          </div>
        </form>
      )}
    </section>
  );
}
