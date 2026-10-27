import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type * as AblyTypes from "ably";
import { ErrorNote, PrimaryButton, SecondaryButton } from "@/components/fields";
import { ReportButton } from "@/components/report-button";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  blockConnectPartner,
  getConnectState,
  getRealtimeToken,
  joinConnect,
  leaveConnect,
  listConnectMessages,
  reportConnectRoom,
  sendConnectMessage,
} from "@/lib/telitol/connect-server";
import type { ConnectMessage, ConnectState } from "@/lib/telitol/connect";
import { CATEGORIES } from "@/lib/telitol/shared";

export const Route = createFileRoute("/connect")({ component: ConnectPage });

type State = ConnectState & { realtime: boolean };

function minutesLeft(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (ms <= 0) return "Time's up";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")} left`;
}

function ConnectPage() {
  const user = useCurrentUser();
  const [state, setState] = useState<State | null>(null);
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState<ConnectMessage[]>([]);
  const [active, setActive] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const ablyRef = useRef<AblyTypes.Realtime | null>(null);

  const roomId = state?.status === "in_room" ? state.room.id : null;
  const realtime = state?.realtime ?? false;

  const refreshState = useCallback(async () => {
    try {
      setState(await getConnectState());
    } catch {
      setError("Couldn't reach Connect. Check your connection.");
    }
  }, []);

  const fetchNew = useCallback(async (id: string) => {
    const result = await listConnectMessages({
      data: { roomId: id, afterId: lastId.current },
    }).catch(() => null);
    if (!result) return;
    setActive(result.active);
    if (result.messages.length === 0) return;
    lastId.current = Math.max(
      lastId.current,
      ...result.messages.map((m) => m.id),
    );
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      return [...current, ...result.messages.filter((m) => !known.has(m.id))];
    });
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  // A new room starts with an empty transcript.
  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
    setActive(true);
    if (roomId) void fetchNew(roomId);
  }, [roomId, fetchNew]);

  // Countdown tick while in a room.
  useEffect(() => {
    if (!roomId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [roomId]);

  // Polling: the only channel without Ably, a slow safety net with it.
  useEffect(() => {
    if (!state || state.status === "idle") return;
    const every = realtime ? 10_000 : state.status === "waiting" ? 3000 : 2000;
    const timer = window.setInterval(() => {
      if (state.status === "waiting") void refreshState();
      else if (roomId && active) void fetchNew(roomId);
    }, every);
    return () => window.clearInterval(timer);
  }, [state, realtime, roomId, active, refreshState, fetchNew]);

  // Realtime: one Ably connection per visit, re-authorized when the room changes
  // so its token can subscribe to that room's channel.
  useEffect(() => {
    if (!realtime || !user) return;
    let cancelled = false;
    let unsubscribe = () => {};
    void (async () => {
      const Ably = await import("ably");
      if (cancelled) return;
      ablyRef.current ??= new Ably.Realtime({
        authCallback: (_params, callback) => {
          getRealtimeToken()
            .then((token) => callback(null, token))
            .catch((err: unknown) =>
              callback(
                err instanceof Error ? err.message : "auth failed",
                null,
              ),
            );
        },
      });
      const ably = ablyRef.current;
      if (roomId) await ably.auth.authorize().catch(() => undefined);
      if (cancelled) return;
      const mine = ably.channels.get(`telitol:user:${user.id}`);
      const onMatched = () => void refreshState();
      await mine.subscribe("matched", onMatched);
      let room: AblyTypes.RealtimeChannel | null = null;
      const onRoom = () => roomId && void fetchNew(roomId);
      if (roomId) {
        room = ably.channels.get(`telitol:room:${roomId}`);
        await room.subscribe(onRoom);
      }
      unsubscribe = () => {
        mine.unsubscribe("matched", onMatched);
        room?.unsubscribe(onRoom);
      };
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realtime, user, roomId, refreshState, fetchNew]);

  useEffect(() => () => ablyRef.current?.close(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function join() {
    setError("");
    setPending(true);
    try {
      const result = await joinConnect({ data: { topic: topic || null } });
      if (!result.ok) setError(result.error);
      else
        setState((current) => ({
          ...result.state,
          realtime: current?.realtime ?? false,
        }));
    } catch {
      setError("Couldn't join. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    setPending(true);
    await leaveConnect().catch(() => undefined);
    setPending(false);
    await refreshState();
  }

  async function send() {
    const body = draft.trim();
    if (!body || !roomId || pending) return;
    setError("");
    setPending(true);
    try {
      const result = await sendConnectMessage({ data: { roomId, body } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      await fetchNew(roomId);
    } catch {
      setError("That didn't send. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function block() {
    if (!roomId) return;
    await blockConnectPartner({ data: { roomId } }).catch(() => undefined);
    setActive(false);
  }

  if (!state) {
    return (
      <div
        className="h-40 animate-pulse rounded-3xl bg-mint"
        aria-hidden="true"
      />
    );
  }

  if (state.status === "idle") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
          <p className="mt-2 text-sm text-muted">
            Talk with one other member, anonymously, for 15 minutes. Neither of
            you sees names. Be kind — either of you can end the chat, block, or
            report at any time.
          </p>
        </div>
        <label htmlFor="topic" className="block text-sm font-semibold">
          What would you like to talk about?
        </label>
        <select
          id="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          className="h-12 w-full rounded-lg border border-line bg-card px-3 text-base"
        >
          <option value="">Anything</option>
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <ErrorNote message={error} />
        <PrimaryButton
          className="w-full"
          disabled={pending}
          onClick={() => void join()}
        >
          {pending ? "Joining…" : "Find someone to talk to"}
        </PrimaryButton>
        <p className="text-xs text-muted">
          Chats are kept for 7 days so reports can be reviewed, then deleted. If
          you're in danger, contact local emergency services.
        </p>
      </div>
    );
  }

  if (state.status === "waiting") {
    return (
      <div className="space-y-4 rounded-3xl border border-line bg-card p-5 text-center">
        <p className="text-lg font-semibold">Looking for someone…</p>
        <p className="text-sm text-muted">
          {state.topic
            ? `Topic: ${CATEGORIES.find((c) => c.id === state.topic)?.label}. `
            : ""}
          Keep this page open. It usually takes a minute or two.
        </p>
        <SecondaryButton onClick={() => void leave()} disabled={pending}>
          Stop looking
        </SecondaryButton>
      </div>
    );
  }

  const { room } = state;
  const timeUp = Date.parse(room.expiresAt) <= now;
  const ended = !active || timeUp;

  return (
    <div className="flex min-h-[70dvh] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            You are{" "}
            <span className="font-semibold text-ink">{room.myAlias}</span>
          </p>
          <p className="text-lg font-semibold">
            Talking with {room.partnerAlias}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-mint px-3 py-1 text-sm font-semibold tabular-nums text-green">
          {ended ? "Ended" : minutesLeft(room.expiresAt, now)}
        </span>
      </div>

      <section className="flex-1 space-y-2" aria-live="polite">
        {messages.length === 0 && !ended ? (
          <p className="text-sm text-muted">
            Say hello. Share only what you're comfortable sharing.
          </p>
        ) : null}
        {messages.map((message) => (
          <p
            key={message.id}
            className={`whitespace-pre-wrap rounded-3xl px-4 py-2 text-sm ${
              message.mine
                ? "ml-10 bg-ink text-on-ink"
                : "mr-10 border border-line bg-card"
            }`}
          >
            {message.body}
          </p>
        ))}
        <div ref={endRef} />
      </section>

      {ended ? (
        <div className="space-y-3 rounded-3xl border border-line bg-card p-4">
          <p className="font-semibold">This chat has ended.</p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={() => void leave()}>
              Find someone new
            </PrimaryButton>
            <ReportButton
              label="Report this chat"
              onReport={(reason, details) =>
                reportConnectRoom({
                  data: { roomId: room.id, reason, details },
                })
              }
            />
          </div>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={draft}
            maxLength={1000}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${room.partnerAlias}…`}
            className="w-full resize-none rounded-lg border border-line bg-card px-3 py-3 text-base outline-none focus-visible:border-green"
          />
          <ErrorNote message={error} />
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton type="submit" disabled={pending || !draft.trim()}>
              Send
            </PrimaryButton>
            <SecondaryButton onClick={() => void leave()}>
              End chat
            </SecondaryButton>
            <button
              type="button"
              className="text-sm font-medium text-muted hover:underline"
              onClick={() => void block()}
            >
              Block
            </button>
            <ReportButton
              onReport={(reason, details) =>
                reportConnectRoom({
                  data: { roomId: room.id, reason, details },
                })
              }
            />
          </div>
        </form>
      )}
    </div>
  );
}
