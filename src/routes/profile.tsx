import { useEffect, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { ErrorNote, PrimaryButton, TextField } from "@/components/fields";
import { getProfile, updateProfile } from "@/lib/telitall/server";
import { formatWhen, reputationLabel, type ProfileData } from "@/lib/telitall/shared";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    void getProfile()
      .then((data) => {
        if (!live) return;
        setProfile(data);
        setName(data.displayName === "Member" ? "" : data.displayName);
      })
      .catch(() => {
        if (live) setError("Couldn't load your profile.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved("");
    setPending(true);
    try {
      const result = await updateProfile({ data: { displayName: name } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProfile((current) => (current ? { ...current, displayName: result.displayName } : current));
      setSaved("Name saved.");
    } catch {
      setError("Couldn't save that name.");
    } finally {
      setPending(false);
    }
  }

  if (!profile && !error) {
    return <div className="h-40 animate-pulse rounded-3xl bg-mint" aria-hidden="true" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{profile?.displayName ?? "You"}</h1>
        <p className="mt-1 text-sm text-muted">{profile ? reputationLabel(profile.reputation) : ""}</p>
      </div>

      {profile ? (
        <section className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm text-muted">Reputation</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{profile.reputation}</p>
          <p className="mt-2 text-sm text-muted">
            You earn points when you ask, answer, and when someone marks your answer helpful or best.
          </p>
        </section>
      ) : null}

      <form className="space-y-3" onSubmit={(event) => void save(event)}>
        <TextField label="Name on your posts" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        <ErrorNote message={error} />
        {saved ? <p className="text-sm font-medium text-green">{saved}</p> : null}
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </PrimaryButton>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your questions</h2>
        {profile && profile.questions.length === 0 ? (
          <p className="text-sm text-muted">You haven't asked yet.</p>
        ) : null}
        <ul className="space-y-2">
          {profile?.questions.map((question) => (
            <li key={question.id}>
              <Link to="/q/$id" params={{ id: String(question.id) }} className="block rounded-2xl border border-line bg-card px-4 py-3">
                <p className="font-medium">{question.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {question.answerCount} {question.answerCount === 1 ? "answer" : "answers"} · {formatWhen(question.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your answers</h2>
        {profile && profile.answers.length === 0 ? (
          <p className="text-sm text-muted">When you answer someone, it shows up here.</p>
        ) : null}
        <ul className="space-y-2">
          {profile?.answers.map((answer) => (
            <li key={answer.id}>
              <Link
                to="/q/$id"
                params={{ id: String(answer.questionId) }}
                className="block rounded-2xl border border-line bg-card px-4 py-3"
              >
                <p className="font-medium">{answer.questionTitle}</p>
                <p className="mt-1 text-sm text-muted">
                  {answer.helpful} helpful{answer.isBest ? " · Best answer" : ""} · {formatWhen(answer.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rounded-3xl border border-line bg-card p-4">
        <UserButton />
      </div>
    </div>
  );
}
