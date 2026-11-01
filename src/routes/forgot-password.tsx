import { useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { ErrorNote, PrimaryButton, TextField } from "@/components/fields";
import { LogoMark, Wordmark } from "@/components/logo";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.includes("@")) {
      setError("Enter the email you signed up with.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many requests. Try again in an hour."
            : result.error.message || "Couldn't send the email. Try again.",
        );
      } else {
        // Same message whether or not the account exists, so emails can't be probed.
        setSent(true);
      }
    } catch {
      setError("Couldn't send the email. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10 text-ink">
      <section className="w-full max-w-md space-y-5 rounded-3xl border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <Wordmark className="text-2xl" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        {sent ? (
          <p className="text-sm text-muted">
            If an account uses{" "}
            <span className="font-medium text-ink">{email.trim()}</span>, a
            reset link is on its way. It works for one hour. Check your spam
            folder if you don't see it.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            <p className="text-sm text-muted">
              We'll email you a link to choose a new password.
            </p>
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
            <ErrorNote message={error} />
            <PrimaryButton type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </PrimaryButton>
          </form>
        )}
        <Link
          to="/login"
          className="block text-sm font-medium text-green hover:underline"
        >
          ← Back to sign in
        </Link>
      </section>
    </main>
  );
}
