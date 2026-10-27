import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { getAuthOptions } from "@/lib/auth/options";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  ErrorNote,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from "@/components/fields";
import { LogoMark, Wordmark } from "@/components/logo";

export const Route = createFileRoute("/login")({ component: LoginPage });

const SOCIAL_LABELS = { google: "Google", twitter: "X" } as const;
type SocialProvider = keyof typeof SOCIAL_LABELS;

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [social, setSocial] = useState<SocialProvider[]>([]);

  useEffect(() => {
    void getAuthOptions()
      .then((options) => setSocial(options.social))
      .catch(() => setSocial([]));
  }, []);

  if (!isPending && user) {
    return <Navigate to="/" />;
  }

  async function onSocialSignIn(provider: SocialProvider) {
    setError("");
    const res = await authClient.signIn.social({ provider, callbackURL: "/" });
    if (res?.error)
      setError(
        res.error.message ??
          `Couldn't sign in with ${SOCIAL_LABELS[provider]}.`,
      );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "up" && name.trim().length < 2) {
      setError("Add the name people should see.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter a real email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    setPending(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({
              email: email.trim(),
              password,
              name: name.trim(),
            })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        const fallback =
          mode === "up"
            ? "Could not create that account."
            : "Those details didn't match.";
        setError(
          result.error.status === 429
            ? "Too many tries. Wait a minute and try again."
            : result.error.message || fallback,
        );
      } else {
        window.location.href = "/";
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That didn't work. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:px-8">
        <section>
          <div className="flex items-center gap-3">
            <LogoMark className="size-14" />
            <div>
              <Wordmark className="text-3xl" />
              <p className="text-sm font-medium text-muted">
                Ask · Learn · Share · Grow
              </p>
            </div>
          </div>
          <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Real people. Real answers.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">
            Ask what you can't look up — a first heartbreak, a first job, a move
            you haven't made yet. People answer from their own lives. AI answers
            when you want a thought right now.
          </p>
          <ol className="mt-8 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">
                1
              </span>
              <span>Ask a person, or ask AI.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">
                2
              </span>
              <span>Read what someone actually lived.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">
                3
              </span>
              <span>Mark the answer that helped.</span>
            </li>
          </ol>
        </section>

        <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-mint p-1">
            <button
              type="button"
              className={`h-11 rounded-full text-sm font-semibold ${mode === "up" ? "bg-card text-ink shadow-card" : "text-muted"}`}
              onClick={() => {
                setMode("up");
                setError("");
              }}
            >
              Create account
            </button>
            <button
              type="button"
              className={`h-11 rounded-full text-sm font-semibold ${mode === "in" ? "bg-card text-ink shadow-card" : "text-muted"}`}
              onClick={() => {
                setMode("in");
                setError("");
              }}
            >
              Sign in
            </button>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            {mode === "up" ? (
              <TextField
                label="Name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="What should people call you?"
              />
            ) : null}
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
            <TextField
              label="Password"
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
            <ErrorNote message={error} />
            <PrimaryButton type="submit" className="w-full" disabled={pending}>
              {pending
                ? "One moment…"
                : mode === "up"
                  ? "Create account"
                  : "Sign in"}
            </PrimaryButton>
          </form>

          {social.length > 0 ? (
            <>
              <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                {social.map((provider) => (
                  <SecondaryButton
                    key={provider}
                    className="w-full"
                    onClick={() => void onSocialSignIn(provider)}
                  >
                    Continue with {SOCIAL_LABELS[provider]}
                  </SecondaryButton>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
