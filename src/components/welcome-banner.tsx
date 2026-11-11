import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

const KEY = "telitol:welcome";

/** Called right after sign-up succeeds, before the page reloads to home. */
export function rememberWelcome(name: string) {
  try {
    window.sessionStorage.setItem(KEY, name || "there");
  } catch {
    // Private mode or blocked storage: the account still exists, just no banner.
  }
}

/** One-time "your account is created" confirmation on the home page. */
export function WelcomeBanner() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(KEY);
      if (stored) {
        window.sessionStorage.removeItem(KEY);
        setName(stored);
      }
    } catch {
      // Storage unavailable: nothing to show.
    }
  }, []);

  if (!name) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-3xl border border-green bg-mint p-4"
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-green font-semibold text-on-green"
      >
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          Your account is created. Welcome to TeliTol, {name}!
        </p>
        <p className="mt-1 text-sm text-muted">
          You're signed in. Ask your first question, or read what others have
          lived.
        </p>
        <Link
          to="/ask"
          className="mt-2 inline-flex text-sm font-semibold text-green hover:underline"
        >
          Ask a person
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setName(null)}
        className="text-sm font-medium text-muted hover:text-ink"
        aria-label="Close welcome message"
      >
        Close
      </button>
    </div>
  );
}
