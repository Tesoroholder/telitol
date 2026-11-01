import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorNote } from "@/components/fields";
import {
  listMyNotifications,
  markNotificationsRead,
} from "@/lib/telitol/notifications-server";
import type { NotificationItem } from "@/lib/telitol/notifications";
import { formatWhen, NOTIFICATIONS_CHANGED } from "@/lib/telitol/shared";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function describe(item: NotificationItem): string {
  const who = item.actorName || "Someone";
  switch (item.kind) {
    case "answer":
      return `${who} answered your question`;
    case "best":
      return "Your answer was chosen as the best answer (+5)";
    case "helpful":
      return item.count > 1
        ? `${item.count} people found your answer helpful`
        : "Someone found your answer helpful";
    case "hidden":
      return "A moderator hid your post after reports";
    case "suspended":
      return "A moderator paused your posting after a review";
  }
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void listMyNotifications()
      .then(setItems)
      .catch(() => setError("Couldn't load notifications."));
  }, []);

  async function open(item: NotificationItem) {
    if (!item.read) {
      setItems((current) =>
        (current ?? []).map((n) =>
          n.id === item.id ? { ...n, read: true } : n,
        ),
      );
      await markNotificationsRead({ data: { id: item.id } }).catch(
        () => undefined,
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    }
    if (item.questionId) {
      void navigate({ to: "/q/$id", params: { id: String(item.questionId) } });
    }
  }

  async function readAll() {
    setItems((current) => (current ?? []).map((n) => ({ ...n, read: true })));
    await markNotificationsRead({ data: {} }).catch(() => undefined);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  const unread = (items ?? []).filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => void readAll()}
            className="text-sm font-medium text-green hover:underline"
          >
            Mark all read
          </button>
        ) : null}
      </div>
      <ErrorNote message={error} />
      {items === null && !error ? (
        <div
          className="h-24 animate-pulse rounded-3xl bg-mint"
          aria-hidden="true"
        />
      ) : null}
      {items && items.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing yet. When someone answers your question or finds your answer
          helpful, you'll see it here.
        </p>
      ) : null}
      <ul className="space-y-2">
        {(items ?? []).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => void open(item)}
              className={`block w-full rounded-2xl border px-4 py-3 text-left ${
                item.read ? "border-line bg-card" : "border-green bg-mint"
              }`}
            >
              <p className="text-sm font-semibold">{describe(item)}</p>
              {item.questionTitle ? (
                <p className="mt-1 line-clamp-1 text-sm text-muted">
                  {item.questionTitle}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                {formatWhen(item.createdAt)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
