import { useState, type FormEvent, type ReactNode } from "react";
import { AreaField, ErrorNote, PrimaryButton, TextField } from "@/components/fields";
import {
  CATEGORIES,
  type CategoryId,
  type QuestionKind,
} from "@/lib/telitol/shared";

export type QuestionDraft = {
  title: string;
  body: string;
  category: CategoryId | "";
  kind: QuestionKind;
};

type Result = { ok: true } | { ok: false; error: string };

/** Kind, category, title and text: used to post a question and to edit one. */
export function QuestionForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  extraActions,
}: {
  initial: QuestionDraft;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (draft: QuestionDraft) => Promise<Result>;
  /** Rendered beside the submit button, e.g. Cancel. */
  extraActions?: ReactNode;
}) {
  const [kind, setKind] = useState<QuestionKind>(initial.kind);
  const [category, setCategory] = useState<CategoryId | "">(initial.category);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await onSubmit({ title, body, category, kind });
      if (!result.ok) setError(result.error);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-mint p-1">
        {(["experience", "knowledge"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            className={`h-11 rounded-full text-sm font-semibold ${kind === value ? "bg-card text-ink shadow-card" : "text-muted"}`}
            onClick={() => setKind(value)}
          >
            {value === "experience" ? "Experience" : "Knowledge"}
          </button>
        ))}
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
                  selected
                    ? "bg-ink text-on-ink"
                    : "border border-line bg-card text-ink"
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
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" className="min-w-40 flex-1" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </PrimaryButton>
        {extraActions}
      </div>
    </form>
  );
}
