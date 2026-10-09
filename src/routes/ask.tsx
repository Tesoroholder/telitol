import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { AreaField, ErrorNote, PrimaryButton, TextField } from "@/components/fields";
import { ModeSwitch } from "@/components/mode-switch";
import { createQuestion } from "@/lib/telitall/server";
import { CATEGORIES, type CategoryId, type QuestionKind } from "@/lib/telitall/shared";

export const Route = createFileRoute("/ask")({ component: AskPage });

function AskPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [kind, setKind] = useState<QuestionKind>("experience");
  const [category, setCategory] = useState<CategoryId | "">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await createQuestion({
        data: {
          title,
          body,
          category,
          kind,
          displayName: user?.displayName ?? user?.primaryEmail ?? "",
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/q/$id", params: { id: String(result.id) } });
    } catch {
      setError("Couldn't post that. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask a person</h1>
        <p className="mt-2 text-sm text-muted">
          Experience questions want a story. Knowledge questions want a clear explanation.
        </p>
      </div>
      <ModeSwitch mode="human" />
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-mint p-1">
          <button
            type="button"
            className={`h-11 rounded-full text-sm font-semibold ${kind === "experience" ? "bg-card text-ink shadow-card" : "text-muted"}`}
            onClick={() => setKind("experience")}
          >
            Experience
          </button>
          <button
            type="button"
            className={`h-11 rounded-full text-sm font-semibold ${kind === "knowledge" ? "bg-card text-ink shadow-card" : "text-muted"}`}
            onClick={() => setKind("knowledge")}
          >
            Knowledge
          </button>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => {
              const selected = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategory(item.id)}
                  className={`h-10 rounded-full px-3 text-sm font-medium ${
                    selected ? "bg-ink text-on-ink" : "border border-line bg-card text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextField
          label="Title"
          value={title}
          maxLength={140}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            kind === "experience"
              ? "What did your first heartbreak actually feel like?"
              : "Why do we complete the square?"
          }
        />
        <AreaField
          label="The question"
          value={body}
          maxLength={4000}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            kind === "experience"
              ? "What you want from someone's life, not a generic tip."
              : "What you're stuck on, and what you've already tried."
          }
        />
        <p className="text-sm text-muted tabular-nums">{title.trim().length}/140</p>
        <ErrorNote message={error} />
        <PrimaryButton type="submit" className="w-full" disabled={pending}>
          {pending ? "Posting…" : "Post question"}
        </PrimaryButton>
      </form>
    </div>
  );
}
