import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { listQuestions } from "@/lib/telitall/server";
import { CATEGORIES, categoryLabel, formatWhen, kindLabel, type QuestionCard } from "@/lib/telitall/shared";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const [questions, setQuestions] = useState<QuestionCard[] | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    void listQuestions()
      .then((rows) => {
        if (live) setQuestions(rows);
      })
      .catch(() => {
        if (live) setError("Couldn't load questions. Refresh and try again.");
      });
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (questions ?? []).filter((question) => {
      if (category !== "all" && question.category !== category) return false;
      if (!needle) return true;
      const hay = `${question.title} ${question.body} ${question.authorName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [questions, category, query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask a person, or ask Laya.</h1>
        <p className="mt-2 text-sm text-muted">
          Real experiences from people. A clear reply from Laya when you want one now.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/ask" className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm font-semibold text-green">Ask a person</p>
          <p className="mt-2 text-sm text-muted">Share a question. People answer from their own lives.</p>
        </Link>
        <Link to="/laya" className="rounded-3xl border border-line bg-mint p-4">
          <p className="text-sm font-semibold text-green">Ask Laya</p>
          <p className="mt-2 text-sm text-ink">An AI reply, right now. Not a substitute for someone's story.</p>
        </Link>
      </div>

      <div>
        <label htmlFor="search" className="sr-only">
          Search questions
        </label>
        <input
          id="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions"
          className="h-12 w-full rounded-full border border-line bg-card px-4 text-base outline-none placeholder:text-muted focus-visible:border-green"
        />
      </div>

      <div className="chip-row -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </Chip>
        {CATEGORIES.map((item) => (
          <Chip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {error ? <p className="text-sm font-medium">{error}</p> : null}

      {questions === null && !error ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-28 animate-pulse rounded-3xl bg-mint" />
          <div className="h-28 animate-pulse rounded-3xl bg-mint" />
          <div className="h-28 animate-pulse rounded-3xl bg-mint" />
        </div>
      ) : null}

      {questions && shown.length === 0 ? (
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="font-semibold">Nothing matches that yet.</p>
          <p className="mt-1 text-sm text-muted">Ask it. Someone may have lived it.</p>
          <Link to="/ask" className="mt-4 inline-flex h-11 items-center rounded-full bg-green px-4 text-sm font-semibold text-on-green">
            Ask a person
          </Link>
        </div>
      ) : null}

      <ul className="space-y-3">
        {shown.map((question) => (
          <li key={question.id}>
            <Link to="/q/$id" params={{ id: String(question.id) }} className="block rounded-3xl border border-line bg-card p-4">
              <p className="text-sm text-muted">
                <span className={question.kind === "experience" ? "font-medium text-green" : "font-medium text-blue"}>
                  {kindLabel(question.kind)}
                </span>
                <span> · {categoryLabel(question.category)}</span>
              </p>
              <h2 className="mt-2 text-lg font-semibold leading-snug">{question.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{question.body}</p>
              <p className="mt-3 text-sm text-muted">
                <span className="font-medium text-ink">{question.authorName}</span>
                <span>
                  {" "}
                  · {question.answerCount} {question.answerCount === 1 ? "answer" : "answers"}
                </span>
                <span> · {formatWhen(question.createdAt)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
        active ? "bg-ink text-on-ink" : "border border-line bg-card text-ink"
      }`}
    >
      {children}
    </button>
  );
}
