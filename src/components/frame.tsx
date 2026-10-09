import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { House, SquarePen, CircleUser } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureProfileFn } from "@/lib/telitol/server";
import { LogoMark, Wordmark } from "@/components/logo";

function BootScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <div className="flex flex-col items-center gap-3">
        <LogoMark className="size-16" />
        <Wordmark className="text-3xl" />
        <p className="text-sm font-medium tracking-wide text-muted">Ask · Learn · Share · Grow</p>
      </div>
    </main>
  );
}

function NavItem({
  to,
  label,
  active,
  children,
}: {
  to: "/" | "/ask" | "/laya" | "/profile";
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
        active ? "text-green" : "text-muted"
      }`}
    >
      {children}
      {label}
    </Link>
  );
}

function LayaIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 ${active ? "text-green" : "text-muted"}`} aria-hidden="true">
      <path
        d="M5 6.5h10.2A3.8 3.8 0 0 1 19 10.3v.2a3.8 3.8 0 0 1-3.8 3.8H9.2L6 17.2v-2.4A3.8 3.8 0 0 1 5 10.5v-.2A3.8 3.8 0 0 1 5 6.5Z"
        fill="currentColor"
      />
      <circle cx="9.2" cy="10.4" r="1" className="fill-card" />
      <circle cx="12.2" cy="10.4" r="1" className="fill-card" />
      <circle cx="15.2" cy="10.4" r="1" className="fill-card" />
    </svg>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const userId = user?.id;
  const knownName = user?.displayName;
  const knownEmail = user?.primaryEmail;
  const home = path === "/" || path.startsWith("/q/");
  const ask = path.startsWith("/ask");
  const laya = path.startsWith("/laya");
  const you = path.startsWith("/profile");

  useEffect(() => {
    if (!userId) return;
    const displayName = knownName?.trim() || knownEmail?.split("@")[0] || "Member";
    void ensureProfileFn({ data: { displayName } }).catch(() => {});
  }, [userId, knownName, knownEmail]);

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="z-30 shrink-0 border-b border-line bg-card">
        <div className="mx-auto flex h-14 max-w-xl items-center px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark />
            <Wordmark className="text-xl" />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-5">{children}</main>
      <nav className="nav-safe shrink-0 border-t border-line bg-card">
        <div className="mx-auto flex max-w-xl">
          <NavItem to="/" label="Home" active={home}>
            <House className="size-6" strokeWidth={1.75} />
          </NavItem>
          <NavItem to="/ask" label="Ask" active={ask}>
            <SquarePen className="size-6" strokeWidth={1.75} />
          </NavItem>
          <NavItem to="/laya" label="Laya" active={laya}>
            <LayaIcon active={laya} />
          </NavItem>
          <NavItem to="/profile" label="You" active={you}>
            <CircleUser className="size-6" strokeWidth={1.75} />
          </NavItem>
        </div>
      </nav>
    </div>
  );
}

export function Frame() {
  const [mounted, setMounted] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isPending) return <BootScreen />;
  if (!user) {
    if (path !== "/login") return <Navigate to="/login" />;
    return <Outlet />;
  }
  if (path === "/login") return <Navigate to="/" />;
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
