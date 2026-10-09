import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ErrorNote, PrimaryButton, SecondaryButton, TextField } from "@/components/fields";
import { LogoMark, Wordmark } from "@/components/logo";

export const Route = createFileRoute("/login")({ component: LoginPage });

type AuthError = { message?: string } | null;

function authMessage(error: AuthError, fallback: string) {
  return error?.message || fallback;
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showDevAuth, setShowDevAuth] = useState(false);
  const [devPasscode, setDevPasscode] = useState("");

  if (!isPending && user && !user.isDevFallback) {
    return <Navigate to="/" />;
  }

  async function onMasterLogin(event?: FormEvent) {
    if (event) event.preventDefault();
    setError("");
    const entered = devPasscode.trim();
    if (!entered) {
      setError("Please enter the Master Developer passcode.");
      return;
    }
    const VALID_PASSCODES = [
      "Tesoro@2026..",
      "telitol2026",
      "MasterPassword2026!",
    ];
    if (!VALID_PASSCODES.includes(entered)) {
      setError("Invalid Master Developer Passcode. Access restricted to authorized personnel.");
      return;
    }
    setPending(true);
    const devEmail = "developer@telitol.com";
    const devName = "Master Developer";
    try {
      let res = await authClient.signIn.email({
        email: devEmail,
        password: entered,
      });
      if (res.error) {
        for (const fallback of VALID_PASSCODES) {
          if (fallback !== entered) {
            const fallbackRes = await authClient.signIn.email({
              email: devEmail,
              password: fallback,
            });
            if (!fallbackRes.error) {
              res = fallbackRes;
              break;
            }
          }
        }
      }
      if (res.error) {
        res = await authClient.signUp.email({
          email: devEmail,
          password: entered,
          name: devName,
        });
      }
      if (res.error) {
        setError(authMessage(res.error, "Could not authorize developer account."));
      } else {
        window.location.href = "/";
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Developer authorization failed.");
    } finally {
      setPending(false);
    }
  }

  async function onSocialSignIn(providerId: string, label: string) {
    setError("");
    const providerKey = providerId.includes("google") ? "google" : "twitter";
    try {
      const res = await authClient.signIn.social({
        provider: providerKey as any,
        callbackURL: "/",
      });
      if (res?.error) {
        throw new Error(res.error.message);
      }
      return;
    } catch {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://telitol-67uk.vercel.app";
      const redirectUri = `${origin}/api/auth/callback/${providerKey}`;
      setError(
        `To connect ${label}: add ${providerKey === "google" ? "GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET" : "TWITTER_CLIENT_ID & TWITTER_CLIENT_SECRET"} to Vercel. Set Redirect URI in ${label} Console to: ${redirectUri}`,
      );
    }
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
      if (mode === "up") {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
        });
        if (result.error) {
          setError(authMessage(result.error, "Could not create that account."));
        } else {
          window.location.href = "/";
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) {
          setError(authMessage(result.error, "Those details didn't match."));
        } else {
          window.location.href = "/";
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
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
              <p className="text-sm font-medium text-muted">Ask · Learn · Share · Grow</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Real people. Real answers.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">
            Ask what you can't look up — a first heartbreak, a first job, a move you haven't made yet.
            People answer from their own lives. Laya answers when you want a thought right now.
          </p>
          <ol className="mt-8 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">1</span>
              <span>Ask a person, or ask Laya.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">2</span>
              <span>Read what someone actually lived.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-semibold text-green">3</span>
              <span>Mark the answer that helped.</span>
            </li>
          </ol>
        </section>

        <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          {/* Master Developer Authorized Access */}
          <div className="mb-5 rounded-2xl border border-green/30 bg-mint/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green flex items-center gap-1.5">
                  <Lock className="size-3.5 inline-block" /> Authorized Developer Access
                </p>
                <p className="text-xs text-muted">Protected with Master Developer Passcode</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDevAuth(!showDevAuth);
                  setError("");
                }}
                className="rounded-full border border-green/40 bg-card px-3 py-1.5 text-xs font-semibold text-green shadow-xs hover:bg-mint transition-all"
              >
                {showDevAuth ? "Close" : "Enter Passcode →"}
              </button>
            </div>

            {showDevAuth && (
              <form onSubmit={onMasterLogin} className="mt-3.5 pt-3 border-t border-line/40">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={devPasscode}
                    onChange={(e) => setDevPasscode(e.target.value)}
                    placeholder="Enter Master Passcode"
                    className="flex-1 rounded-xl border border-line bg-card px-3.5 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-green"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={pending || !devPasscode}
                    className="rounded-xl bg-green px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {pending ? "Verifying…" : "Unlock"}
                  </button>
                </div>
              </form>
            )}
          </div>

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

          <form className="mt-5 space-y-4" onSubmit={(event) => void onSubmit(event)}>
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
              {pending ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}
            </PrimaryButton>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
            <span className="h-px flex-1 bg-line" />
            or social login
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <SecondaryButton
                key={provider.providerId}
                className="w-full"
                onClick={() => void onSocialSignIn(provider.providerId, provider.label)}
              >
                Continue with {provider.label}
              </SecondaryButton>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            Tip: Authorized Developer Login or Email & Password work immediately on your domain.
          </p>
        </section>
      </div>
    </main>
  );
}
