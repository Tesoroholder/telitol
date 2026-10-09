import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ErrorNote, PrimaryButton } from "@/components/fields";
import { ModeSwitch } from "@/components/mode-switch";
import { askLaya, getLayaThread, listLayaThreads } from "@/lib/telitol/server";
import type { LayaMessage, LayaThread } from "@/lib/telitol/shared";

export const Route = createFileRoute("/laya")({ component: LayaPage });

const STARTERS = [
  "What does a first heartbreak usually feel like, honestly?",
  "How should I prepare for an interview if I have almost no experience?",
  "Explain completing the square like I'm new to it.",
  "I just moved to a new city alone. What should I expect?",
];

function LayaPage() {
  const [threads, setThreads] = useState<LayaThread[]>([]);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<LayaMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void listLayaThreads()
      .then(async (rows) => {
        if (!live) return;
        setThreads(rows);
        const first = rows[0];
        if (!first) {
          setReady(true);
          return;
        }
        setThreadId(first.id);
        setTitle(first.title);
        const detail = await getLayaThread({ data: { threadId: first.id } });
        if (!live) return;
        setMessages(detail?.messages ?? []);
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setError("Couldn't open Laya. Try again.");
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  async function openThread(next: LayaThread) {
    setError("");
    setThreadId(next.id);
    setTitle(next.title);
    setPending(true);
    try {
      const detail = await getLayaThread({ data: { threadId: next.id } });
      setMessages(detail?.messages ?? []);
    } catch {
      setError("Couldn't open that chat.");
    } finally {
      setPending(false);
    }
  }

  function newChat() {
    setThreadId(null);
    setTitle("");
    setMessages([]);
    setPrompt("");
    setError("");
  }

  async function send(text: string) {
    const next = text.trim();
    if (next.length < 2 || pending) return;
    setError("");
    setPending(true);
    setPrompt("");
    try {
      const result = await askLaya({ data: { threadId, prompt: next } });
      if (!result.ok) {
        setPrompt(next);
        setError(result.error);
        return;
      }
      setThreadId(result.threadId);
      setTitle(result.title);
      setMessages(result.messages);
      setThreads((current) => {
        const rest = current.filter((item) => item.id !== result.threadId);
        return [{ id: result.threadId, title: result.title, updatedAt: new Date().toISOString() }, ...rest];
      });
    } catch {
      setPrompt(next);
      setError("Laya couldn't answer just now. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Laya</h1>
        <p className="mt-2 text-sm text-muted">
          AI answers when you want one now. For a story someone lived, ask a person.
        </p>
      </div>
      <ModeSwitch mode="laya" />

      <div className="chip-row -mx-4 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={newChat}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${
            threadId == null ? "bg-ink text-on-ink" : "border border-line bg-card"
          }`}
        >
          New chat
        </button>
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => void openThread(thread)}
            className={`h-10 max-w-48 shrink-0 truncate rounded-full px-4 text-sm font-medium ${
              thread.id === threadId ? "bg-ink text-on-ink" : "border border-line bg-card"
            }`}
          >
            {thread.title}
          </button>
        ))}
      </div>

      <section className="min-h-64 space-y-3" aria-live="polite">
        {ready && messages.length === 0 && !pending ? (
          <div className="rounded-3xl border border-line bg-card p-4">
            <p className="font-semibold">{title ? title : "Ask Laya something specific."}</p>
            <p className="mt-1 text-sm text-muted">
              Laya is not a doctor, therapist, or a person who lived your story.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void send(starter)}
                  className="rounded-2xl border border-line px-3 py-3 text-left text-sm font-medium hover:bg-mint"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-3xl px-4 py-3 text-sm leading-relaxed ${
              message.role === "user" ? "ml-8 bg-ink text-on-ink" : "mr-6 border border-line bg-card"
            }`}
          >
            <p className={`mb-1 text-xs font-semibold ${message.role === "user" ? "text-on-ink" : "text-green"}`}>
              {message.role === "user" ? "You" : "Laya"}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </article>
        ))}

        {pending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="flex gap-1" aria-hidden="true">
              <span className="laya-dot size-1.5 rounded-full bg-green" />
              <span className="laya-dot size-1.5 rounded-full bg-green" />
              <span className="laya-dot size-1.5 rounded-full bg-green" />
            </span>
            Laya is thinking
          </p>
        ) : null}
        <div ref={endRef} />
      </section>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(prompt);
        }}
      >
        <label htmlFor="laya-prompt" className="sr-only">
          Message Laya
        </label>
        <textarea
          id="laya-prompt"
          value={prompt}
          maxLength={2000}
          rows={3}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(prompt);
            }
          }}
          placeholder="Ask Laya…"
          className="w-full resize-y rounded-lg border border-line bg-card px-3 py-3 text-base outline-none placeholder:text-muted focus-visible:border-green"
        />
        <ErrorNote message={error} />
        <PrimaryButton type="submit" className="w-full" disabled={pending || prompt.trim().length < 2}>
          {pending ? "Sending…" : "Ask Laya"}
        </PrimaryButton>
        <p className="text-xs text-muted">
          General insight, not professional advice. If this is an emergency, contact local services.
        </p>
      </form>
    </div>
  );
}
