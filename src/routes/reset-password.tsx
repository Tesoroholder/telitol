import { useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { ErrorNote, PrimaryButton, TextField } from "@/components/fields";
import { LogoMark, Wordmark } from "@/components/logo";

export const Route = createFileRoute("/reset-password")({
  // The emailed link lands here with ?token=… (or ?error=INVALID_TOKEN when expired).
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    if (!token) return;
    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error)
        setError(
          result.error.message || "That link has expired. Request a new one.",
        );
      else setDone(true);
    } catch {
      setError("Couldn't change the password. Try again.");
    } finally {
      setPending(false);
    }
  }

  const invalid = !token || Boolean(linkError);

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10 text-ink">
      <section className="w-full max-w-md space-y-5 rounded-3xl border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <Wordmark className="text-2xl" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        {done ? (
          <>
            <p className="text-sm text-muted">
              Your password is changed. You've been signed out everywhere else.
            </p>
            <Link
              to="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-green px-5 font-semibold text-on-green"
            >
              Sign in
            </Link>
          </>
        ) : invalid ? (
          <>
            <p className="text-sm text-muted">
              This reset link is invalid or has expired. Links work for one
              hour.
            </p>
            <Link
              to="/forgot-password"
              className="block text-sm font-medium text-green hover:underline"
            >
              Send a new link
            </Link>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
            <TextField
              label="Type it again"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <ErrorNote message={error} />
            <PrimaryButton type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save new password"}
            </PrimaryButton>
          </form>
        )}
      </section>
    </main>
  );
}
