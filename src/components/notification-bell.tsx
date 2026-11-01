import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/lib/telitol/notifications-server";
import { NOTIFICATIONS_CHANGED } from "@/lib/telitol/shared";

/** Header bell with the unread count; refreshes every minute, on focus and on navigation. */
export function NotificationBell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [count, setCount] = useState(0);

  useEffect(() => {
    let live = true;
    const refresh = () =>
      void getUnreadCount()
        .then((n) => live && setCount(n))
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [path]);

  const active = path.startsWith("/notifications");
  return (
    <Link
      to="/notifications"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
      className={`relative ml-auto grid size-10 place-items-center rounded-full ${active ? "bg-mint text-green" : "text-muted"}`}
    >
      <Bell className="size-6" strokeWidth={1.75} />
      {count > 0 ? (
        <span className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-green px-1 text-[11px] font-bold leading-5 text-on-green tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
