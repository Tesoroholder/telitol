import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark, Wordmark } from "@/components/logo";
import { getSupportEmail } from "@/lib/telitol/site-server";

/**
 * Layout for pages anyone can open without signing in (Privacy, Terms,
 * Delete account). Google Play reviewers open these links directly.
 */
export function PublicPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark />
            <Wordmark className="text-xl" />
          </Link>
        </div>
      </header>
      <article className="legal mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {updated ? (
            <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
          ) : null}
        </div>
        {children}
        <LegalLinks className="border-t border-line pt-6" />
      </article>
    </main>
  );
}

/** Privacy · Terms · Delete account, for footers. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const link = "font-medium text-muted hover:text-ink hover:underline";
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${className}`}
    >
      <Link to="/privacy" className={link}>
        Privacy Policy
      </Link>
      <Link to="/terms" className={link}>
        Terms of Use
      </Link>
      <Link to="/delete-account" className={link}>
        Delete account
      </Link>
    </nav>
  );
}

/** The support email from the server (SUPPORT_EMAIL), or null while loading / unset. */
export function useSupportEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getSupportEmail()
      .then((value) => {
        if (live) setEmail(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return email;
}

/** "email us at …" sentence, or a fallback when no support email is configured. */
export function ContactLine({ prefix }: { prefix: string }) {
  const email = useSupportEmail();
  if (!email) return null;
  return (
    <p>
      {prefix}{" "}
      <a className="font-medium text-green underline" href={`mailto:${email}`}>
        {email}
      </a>
      .
    </p>
  );
}
