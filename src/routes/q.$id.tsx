import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { AreaField, ErrorNote, PrimaryButton, SecondaryButton } from "@/components/fields";
import { acceptAnswer, createAnswer, deleteQuestion, getQuestion, voteHelpful } from "@/lib/telitol/server";
import { categoryLabel, formatWhen, kindLabel, type AnswerCard, type QuestionCard } from "@/lib/telitol/shared";

export const Route = createFileRoute("/q/$id")({ component: QuestionPage });

function QuestionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  const [answers, setAnswers] = useState<AnswerCard[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    setQuestion(null);
    setMissing(false);
    setError("");
    void getQuestion({ data: { id: Number(id) } })
      .then((detail) => {
        if (!live) return;
        if (!detail) {
          setMissing(true);
          return;
        }
        setQuestion(detail.question);
        setAnswers(detail.answers);
      })
      .catch(() => {
        if (live) setError("Couldn't load this question.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  async function onAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!question) return;
    setError("");
    setPending(true);
    try {
      const result = await createAnswer({
        data: {
          questionId: question.id,
          body,
          displayName: user?.displayName ?? user?.primaryEmail ?? "",
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const detail = await getQuestion({ data: { id: question.id } });
      if (detail) {
        setQuestion(detail.question);
        setAnswers(detail.answers);
      }
      setBody("");
    } catch {
      setError("Couldn't post that answer.");
    } finally {
      setPending(false);
    }
  }

  async function onVote(answerId: number) {
    setError("");
    const result = await voteHelpful({ data: { answerId } }).catch(() => null);
    if (!result) {
      setError("Couldn't save that vote.");
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswers((current) =>
      current.map((answer) =>
        answer.id === answerId ? { ...answer, voted: true, helpful: result.helpful } : answer,
      ),
    );
  }

  async function onAccept(answerId: number) {
    setError("");
    const result = await acceptAnswer({ data: { answerId } }).catch(() => null);
    if (!result || !result.ok) {
      setError(result && !result.ok ? result.error : "Couldn't accept that answer.");
      return;
    }
    setAnswers((current) => current.map((answer) => ({ ...answer, isBest: answer.id === answerId })));
  }

  async function onDelete() {
    if (!question) return;
    setPending(true);
    try {
      const result = await deleteQuestion({ data: { id: question.id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/" });
    } catch {
      setError("Couldn't delete that question.");
    } finally {
      setPending(false);
    }
  }

  if (error && !question && !missing) return <p className="text-sm font-medium">{error}</p>;
  if (missing) {
    return (
      <div className="rounded-3xl border border-line bg-card p-4">
        <p className="font-semibold">This question isn't here.</p>
        <Link to="/" className="mt-3 inline-flex text-sm font-semibold text-green">
          Back home
        </Link>
      </div>
    );
  }
  if (!question) return <div className="h-48 animate-pulse rounded-3xl bg-mint" aria-hidden="true" />;

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm font-semibold text-green">
        Back
      </Link>
      <article className="space-y-3">
        <p className="text-sm text-muted">
          <span className={question.kind === "experience" ? "font-medium text-green" : "font-medium text-blue"}>
            {kindLabel(question.kind)}
          </span>
          <span> · {categoryLabel(question.category)}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{question.title}</h1>
        <p className="whitespace-pre-wrap text-base">{question.body}</p>
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{question.authorName}</span>
          {question.reputation > 0 ? <span className="tabular-nums"> · {question.reputation} pts</span> : null}
          <span> · {formatWhen(question.createdAt)}</span>
        </p>
        {question.category === "health" ? (
          <p className="text-sm text-muted">Personal experiences only — not medical advice.</p>
        ) : null}
        {question.isMine ? (
          <div>
            {confirmDelete ? (
              <div className="flex gap-2">
                <SecondaryButton onClick={() => void onDelete()} disabled={pending}>
                  Confirm delete
                </SecondaryButton>
                <SecondaryButton onClick={() => setConfirmDelete(false)}>Keep it</SecondaryButton>
              </div>
            ) : (
              <button type="button" className="text-sm font-medium text-muted" onClick={() => setConfirmDelete(true)}>
                Delete question
              </button>
            )}
          </div>
        ) : null}
      </article>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {answers.length} {answers.length === 1 ? "answer" : "answers"}
        </h2>
        {answers.length === 0 ? (
          <p className="text-sm text-muted">No answers yet. If you've lived this, say so.</p>
        ) : null}
        <ul className="space-y-3">
          {answers.map((answer) => (
            <li
              key={answer.id}
              className={`rounded-3xl border p-4 ${answer.isBest ? "border-green bg-mint" : "border-line bg-card"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-semibold">{answer.authorName}</span>
                  <span className="text-muted"> · {formatWhen(answer.createdAt)}</span>
                </p>
                {answer.isBest ? <span className="text-xs font-semibold text-green">Best answer</span> : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{answer.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {answer.isMine ? (
                  <span className="text-sm text-muted">Your answer</span>
                ) : (
                  <SecondaryButton
                    className="h-10 px-4 text-sm"
                    disabled={answer.voted}
                    onClick={() => void onVote(answer.id)}
                  >
                    {answer.voted ? "Marked helpful" : "Helpful"} · <span className="tabular-nums">{answer.helpful}</span>
                  </SecondaryButton>
                )}
                {question.isMine && !answer.isBest ? (
                  <SecondaryButton className="h-10 px-4 text-sm" onClick={() => void onAccept(answer.id)}>
                    Accept
                  </SecondaryButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="space-y-3" onSubmit={(event) => void onAnswer(event)}>
        <AreaField
          label="Your answer"
          value={body}
          maxLength={4000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What you lived, or what you know. Be specific."
        />
        <ErrorNote message={question ? error : ""} />
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post answer"}
        </PrimaryButton>
      </form>
    </div>
  );
}
